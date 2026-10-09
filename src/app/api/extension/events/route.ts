import {extensionRoute,extensionActor,recordObservation,cors} from '@/lib/capture/server';
export async function OPTIONS(request:Request){return cors(request,new Response(null,{status:204}));}
export async function POST(request:Request){return extensionRoute(request,async()=>recordObservation(await extensionActor(request),await request.json()));}