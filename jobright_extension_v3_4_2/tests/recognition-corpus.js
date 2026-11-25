// Positive set: wording variants that MUST resolve to the expected fact.
// [question wording as portals phrase it, expected fact key]
module.exports = [
 // work authorization
 ['Are you eligible to work in the United States?','authorized_in_usa'],
 ['Do you have authorization to work in the US?','authorized_in_usa'],
 ['Are you currently authorized to work in the United States without restriction?','authorized_in_usa'],
 ['Are you legally eligible for employment in the U.S.?','authorized_in_usa'],
 ['Do you have the legal right to work in the United States?','authorized_in_usa'],
 ['Can you legally work in the US for any employer?','authorized_in_usa'],
 ['Are you permitted to work in the United States?','authorized_in_usa'],
 ['Work eligibility: are you legally able to work in the USA','authorized_in_usa'],
 ['Do you possess valid US work authorization?','authorized_in_usa'],
 ['Are you lawfully authorized to work in the United States?','authorized_in_usa'],
 // sponsorship
 ['Will you now or in the future require sponsorship?','needs_sponsorship'],
 ['Do you now, or will you in the future, require the company to sponsor you for an employment visa?','needs_sponsorship'],
 ['Will you need the company to sponsor a work visa for you?','needs_sponsorship'],
 ['Do you need visa support to work for us?','needs_sponsorship'],
 ['Would you require H-1B or other immigration sponsorship?','needs_sponsorship'],
 ['Are you in need of employment sponsorship?','needs_sponsorship'],
 ['Will you require immigration assistance to work in the United States?','needs_sponsorship'],
 ['Does this role require you to be sponsored for a work permit?','needs_sponsorship'],
 ['Is visa transfer or sponsorship needed for you to work here?','needs_sponsorship'],
 ['Do you require employer-sponsored work authorization?','needs_sponsorship'],
 // relocation
 ['Are you willing to relocate for this position?','open_to_relocation'],
 ['Would you be open to moving to our office location?','open_to_relocation'],
 ['Are you able to relocate?','open_to_relocation'],
 
 // start/availability
 ['When are you available to start?','availability'],
 ['What is your notice period?','availability'],
 ['How soon can you join?','availability'],
 ['Earliest date you could begin working','availability'],
 ['Available from','availability'],
 // salary
 ['What are your compensation expectations?','salary_expectation'],
 ['What is your desired annual base pay?','salary_expectation'],
 ['Salary requirements','salary_expectation'],
 
 // experience
 ['How many years of experience do you have?','total_experience_years'],
 ['Total years of professional experience','total_experience_years'],
 
 ['How long have you been working in this field?','total_experience_years'],
 ['Total experience (in years)','total_experience_years'],
 // name
 ['First Name','first_name'],['Given name(s)','first_name'],['Legal first name','first_name'],
 ['Surname','last_name'],['Family Name','last_name'],['Last name / Family name','last_name'],
 ['What is your name?','full_name'],['Full name (as on your ID)','full_name'],
 ['What should we call you?','preferred_first_name'],
 // contact
 ['E-mail address','email'],['Your email','email'],['Best email to reach you','email'],
 ['Mobile number','phone'],['Best phone number to reach you','phone'],['Contact number','phone'],['Phone (cell)','phone'],
 // location
 ['City','current_city'],['Which city are you located in?','current_city'],['Town / City','current_city'],
 ['State / Province','current_state'],['Which state do you live in?','current_state'],
 ['ZIP / Postal code','zip_code'],['Postcode','zip_code'],['PIN code','zip_code'],
 ['Where are you currently located?','current_location'],['Current location (City, State)','current_location'],['Where do you live?','current_city'],
 ['Country','country'],['Country you reside in','country'],['Which country are you based in?','country'],
 ['Street address','full_address'],['Address line 1','full_address'],['Home address','full_address'],
 // links
 ['LinkedIn profile URL','linkedin_url'],['Link to your LinkedIn','linkedin_url'],
 // employer/title
 ['Current company','current_employer'],['Who is your current employer?','current_employer'],['Most recent employer','current_employer'],['Where do you currently work?','current_employer'],
 ['Current job title','current_title'],['What is your current role?','current_title'],['Most recent job title','current_title'],['What is your present designation?','current_title'],
 // education
 ['What is your highest level of education completed?','highest_education'],['Highest degree obtained','highest_education'],['Education level','highest_education'],
 ['Do you hold a bachelor\'s degree?','highest_education'],
 ['University','school'],['School attended','school'],['Name of institution','school'],['Where did you go to school?','school'],
 ['Year of graduation','graduation_year'],['When did you graduate?','graduation_year'],['Graduation date (year)','graduation_year'],
 // EEO
 ['Gender','gender'],['What is your gender identity?','gender'],['Please select your sex','gender'],
 ['Are you Hispanic/Latino?','race'],['Race/Ethnicity','race'],['Which race best describes you?','race'],
 ['Veteran status','veteran'],['Have you served in the U.S. military?','veteran'],['Are you a protected veteran?','protected_veteran'],
 ['Do you have a disability?','disability'],['Disability status','disability'],['Please indicate if you have a disability','disability'],
 ['Citizenship','citizenship_status'],['Are you a U.S. citizen?','citizenship_status'],['What is your country of citizenship?','citizenship_status'],
 // how heard
 ['How did you hear about us?','how_heard'],['Where did you find out about this job?','how_heard'],['How did you learn about this position?','how_heard'],['Source','how_heard'],['What brought you to our careers page?','how_heard'],
 // dob
 ['Date of birth','date_of_birth'],['DOB (mm/dd/yyyy)','date_of_birth'],['Birthday','date_of_birth'],
 // visa status
 ['What is your current visa status?','visa_status'],['Type of work visa you hold','visa_status'],['Immigration status','visa_status'],['What is your current work authorization type?','visa_status'],
 // skills / website
 ['Key skills','primary_skills'],['List your technical skills','primary_skills'],['Portfolio / website','website'],['Personal website URL','website'],['GitHub profile','github_url'],
];
