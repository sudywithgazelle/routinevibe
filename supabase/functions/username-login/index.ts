// Deploy: supabase functions deploy username-login --no-verify-jwt
// Browser never receives SUPABASE_SERVICE_ROLE_KEY. Do not log passwords.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const env = (name: string) => Deno.env.get(name) ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async (req) => {
 if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
 if (req.method!=='POST') return reply({error:'Method not allowed'},405);
 let input: {username?: unknown,password?: unknown};
 try { input=await req.json(); }catch{return reply({error:'Invalid request'},400);}
 const username=String(input.username??'').trim().toLowerCase();
 const password=String(input.password??'');
 if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length<8 || password.length>256)
  return reply({error:'Invalid username or password'},400);
 try {
  const url=env('SUPABASE_URL');
  const anon=env('SUPABASE_ANON_KEY');
  const service=env('SUPABASE_SERVICE_ROLE_KEY');
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data: profile,error:lookErr}=await admin.from('profiles').select('user_id').eq('username',username).maybeSingle();
  if (lookErr || !profile) return reply({error:'Invalid username or password'},401);
  const {data:userData,error:userErr}=await admin.auth.admin.getUserById(profile.user_id);
  if (userErr || !userData?.user?.email) return reply({error:'Invalid username or password'},401);
  const authClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await authClient.auth.signInWithPassword({email:userData.user.email,password});
  if (error || !data.session) return reply({error:'Invalid username or password'},401);
  return reply({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return reply({error:'Sign-in temporarily unavailable'},503);}
});
