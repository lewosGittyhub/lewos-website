const params=new URLSearchParams(location.search);
const token=params.get("token")||"";
const form=document.querySelector("#confirm");
const button=document.querySelector("#continue");
const progress=document.querySelector("#progress");
const error=document.querySelector("#error");
const fail=()=>{progress.hidden=true;form.hidden=false;button.disabled=false;button.removeAttribute("aria-busy");error.style.display="block";error.focus();};
if(!token){fail();form.hidden=true;}
form.addEventListener("submit",async event=>{
  event.preventDefault();
  error.style.display="none";
  button.disabled=true;
  button.setAttribute("aria-busy","true");
  progress.hidden=false;
  try{
    const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"first_access",token,adultConfirmed:document.querySelector("#adult").checked,privacyAccepted:document.querySelector("#privacy").checked,filmingAcknowledged:document.querySelector("#filming").checked})});
    const result=await response.json();
    if(!response.ok||!result.checkoutUrl)fail();else location.replace(result.checkoutUrl);
  }catch{fail();}
});
