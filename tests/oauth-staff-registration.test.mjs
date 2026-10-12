import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { recruitingDatabase } from './helpers/recruiting-db.mjs';

let db;
const newUser = '10000000-0000-4000-8000-000000000201';
const existingUser = '10000000-0000-4000-8000-000000000202';
const now = new Date().toISOString();
const beforeRegistration = new Date(Date.now() - 60_000).toISOString();
const newIntent = '20000000-0000-4000-8000-000000000201';
const existingIntent = '20000000-0000-4000-8000-000000000202';
const expiredIntent = '20000000-0000-4000-8000-000000000203';
before(async () => {
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => /^20261009\d{6}_|^20261011\d{6}_/.test(name) && !name.includes('foundation')).sort();
  db = await recruitingDatabase(files);
  // The test auth schema is deliberately small; these are standard Supabase auth columns.
  await db.exec(`ALTER TABLE auth.users ADD COLUMN created_at timestamptz DEFAULT now(); ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb DEFAULT '{"provider":"google"}';`);
  await db.query(`INSERT INTO oauth_registration_intents(id,role,started_at) VALUES($1,'technical_recruiter',$3),($2,'technical_recruiter',$3)`, [newIntent, existingIntent, beforeRegistration]);
  await db.query(`INSERT INTO oauth_registration_intents(id,role,expires_at) VALUES($1,'technical_recruiter','2026-01-01T00:00:00Z')`, [expiredIntent]);
  await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES($1,'new@example.test','{}',$3),($2,'existing@example.test','{}',$4)`, [newUser, existingUser, now, '2026-01-01T00:00:00Z']);
});
after(async () => { await db?.close(); });

test('a genuinely new Google account becomes pending technical staff and cannot access staff data', async () => {
  let outcome;
  try {
    await db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid)`, [newUser, newIntent]);
    outcome = (await db.query('SELECT role,status FROM profiles WHERE id=$1', [newUser])).rows[0];
  } catch (error) { outcome = error.message; }
  assert.deepEqual(outcome, { role: 'technical_recruiter', status: 'pending' });
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${newUser}';`);
  assert.equal((await db.query('SELECT get_current_role() role')).rows[0].role, null);
  await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
});

test('an existing candidate cannot convert their profile with a fresh OAuth intent', async () => {
  const result = await db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid) changed`, [existingUser, existingIntent]);
  assert.equal(result.rows[0].changed, false);
  assert.deepEqual((await db.query('SELECT role,status FROM profiles WHERE id=$1', [existingUser])).rows[0], { role: 'client', status: 'active' });
});

test('signed registration intents cannot activate staff or create administrators', async () => {
  await assert.rejects(db.query(`SELECT register_new_oauth_staff($1,'super_admin',$2::uuid)`, [existingUser, existingIntent]), /role/i);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${existingUser}';`);
  await assert.rejects(db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid)`, [existingUser, existingIntent]), /permission denied/i);
  await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
});

test('expired OAuth registration cannot change a profile', async () => {
  const result = await db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid) changed`, [existingUser, expiredIntent]);
  assert.equal(result.rows[0].changed, false);
});

test('a consumed registration intent cannot register a second Google account', async () => {
  const otherUser = '10000000-0000-4000-8000-000000000203';
  await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'other@example.test','{}')`, [otherUser]);
  const result = await db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid) changed`, [otherUser, newIntent]);
  assert.equal(result.rows[0].changed, false);
  assert.deepEqual((await db.query('SELECT role,status FROM profiles WHERE id=$1', [otherUser])).rows[0], { role: 'client', status: 'active' });
  assert.equal((await db.query(`SELECT register_new_oauth_staff($1,'technical_recruiter',$2::uuid) changed`, [otherUser, existingIntent])).rows[0].changed, false);
});

test('administrator corrects a previously affected candidate to pending staff with separate approval', async () => {
  const admin = '10000000-0000-4000-8000-000000000204';
  await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'admin@example.test','{}')`, [admin]);
  await db.query(`UPDATE profiles SET role='super_admin',status='active' WHERE id=$1`, [admin]);
  let outcome;
  try {
    await db.query(`SELECT correct_staff_account_role($1,$2,'technical_recruiter','Correct prior Google registration')`, [admin, existingUser]);
    outcome = (await db.query('SELECT role,status FROM profiles WHERE id=$1', [existingUser])).rows[0];
  } catch (error) { outcome = error.message; }
  assert.deepEqual(outcome, { role: 'technical_recruiter', status: 'pending' });
  const audit = (await db.query(`SELECT metadata FROM audit_events WHERE subject_id=$1 AND action='staff_account_role_corrected'`, [existingUser])).rows[0].metadata;
  assert.equal(audit.from_role, 'client');
  assert.equal(audit.to_role, 'technical_recruiter');
  assert.equal(audit.to_status, 'pending');
  await assert.rejects(db.query(`SELECT correct_staff_account_role($1,$2,'recruiter',NULL)`, [admin, admin]), /own account/i);
  await assert.rejects(db.query(`SELECT correct_staff_account_role($1,$2,'recruiter',NULL)`, [existingUser, newUser]), /administrator/i);
  await assert.rejects(db.query(`SELECT correct_staff_account_role($1,$2,'recruiter',NULL)`, [admin, newUser]), /candidate/i);
  await assert.rejects(db.query(`SELECT correct_staff_account_role($1,$2,'super_admin',NULL)`, [admin, existingUser]), /role/i);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${existingUser}';`);
  await assert.rejects(db.query(`SELECT correct_staff_account_role($1,$2,'technical_recruiter',NULL)`, [admin, existingUser]), /permission denied/i);
  await assert.rejects(db.query('SELECT * FROM oauth_registration_intents'), /permission denied/i);
  await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
  await db.query(`SELECT set_staff_account_status($1,$2,'active')`, [admin, existingUser]);
  assert.equal((await db.query('SELECT status FROM profiles WHERE id=$1', [existingUser])).rows[0].status, 'active');
});
