export async function api<T>(url:string,options?:RequestInit):Promise<T> {
 const response=await fetch(url,{...options,headers:{...(options?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options?.headers}});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'The request failed. Retry.');return data as T;
}