export class ApiRequestError extends Error {
 constructor(message:string,public readonly status:number|null){super(message);this.name='ApiRequestError';}
}
export async function api<T>(url:string,options?:RequestInit):Promise<T> {
 let response:Response;
 try{response=await fetch(url,{...options,headers:{...(options?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options?.headers}});}
 catch{throw new ApiRequestError('Could not reach NextKinHR. Check your internet connection or proxy/VPN, then check the saved request status.',null);}
 let data;
 try{data=await response.json();}catch{throw new ApiRequestError('The server returned an unreadable response. Retry the status check.',response.status);}
 if(!response.ok)throw new ApiRequestError(data.error||'The request failed. Retry.',response.status);
 return data as T;
}
