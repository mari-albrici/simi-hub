import { signedDocumentVersion } from "@/lib/documents";
import { publicError } from "@/lib/errors";
export async function GET(request:Request,{params}:{params:Promise<{version:string}>}){
 try{const url=await signedDocumentVersion((await params).version,new URL(request.url).searchParams.get("download")==="1");return new Response(null,{status:302,headers:{Location:url,"Cache-Control":"private, no-store"}});}catch(e){const err=publicError(e);return Response.json({error:err.message},{status:err.kind==="forbidden"?403:err.kind==="authentication"?401:400,headers:{"Cache-Control":"no-store"}});}
}
