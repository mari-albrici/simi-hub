"use client";
import { useState } from "react";
import { LoadingSpinner } from "@/components/ui/loading";
export function DocumentPreview({src,title,className}:{src:string;title:string;className?:string}) {
 const [loading,setLoading]=useState(true);
 const [failed,setFailed]=useState(false);
 const [attempt,setAttempt]=useState(0);
 return <div aria-busy={loading}>
  {loading&&<div role="status" className="py-2"><LoadingSpinner label="Caricamento documento…"/></div>}
  {failed&&<div role="alert" className="alert alert-warning">Impossibile caricare il documento. <button className="btn btn-sm btn-outline-secondary" onClick={()=>{setFailed(false);setLoading(true);setAttempt(attempt+1);}}>Riprova</button></div>}
  <iframe key={attempt} src={src} title={title} className={className} onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true);}}/>
 </div>;
}
