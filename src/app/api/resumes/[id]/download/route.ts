import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {ownDocument} from '@/lib/resumes/repository';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const document=await ownDocument(profile,(await context.params).id);
  const {data,error}=await database().storage.from('candidate-resumes').createSignedUrl(document.object_path,300,{download:document.filename});
  if(error||!data)throw new CaptureError('Resume download is unavailable.',503);return {url:data.signedUrl};
});}
