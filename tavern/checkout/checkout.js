const params=new URLSearchParams(location.search);
const token=params.get("token")||"";
const form=document.querySelector("#confirm");
const progress=document.querySelector("#progress");
const error=document.querySelector("#error");
const fail=()=>{progress.hidden=true;form.hidden=true;error.style.display="block";error.focus();};
if(!token)fail();
form.addEventListener("submit",async event=>{
  event.preventDefault();
  form.hidden=true;
  progress.hidden=false;
  try{
    const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"first_access",token,adultConfirmed:document.querySelector("#adult").checked,privacyAccepted:document.querySelector("#privacy").checked,filmingConsent:document.querySelector("#filming").checked})});
    const result=await response.json();
    if(!response.ok||!result.checkoutUrl)fail();else location.replace(result.checkoutUrl);
  }catch{fail();}
});
