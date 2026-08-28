const params=new URLSearchParams(location.search);
const token=params.get("token")||"";
const progress=document.querySelector("#progress");
const error=document.querySelector("#error");
const fail=()=>{progress.hidden=true;error.style.display="block";};
if(!token){fail();}else{
  try{
    const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"first_access",token})});
    const result=await response.json();
    if(!response.ok||!result.checkoutUrl)fail();else location.replace(result.checkoutUrl);
  }catch{fail();}
}
