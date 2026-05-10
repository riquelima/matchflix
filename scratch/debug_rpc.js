async function checkRpc() {
  const SUPABASE_URL = "https://kewwqxfpjzrxduhoqfxw.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";
  const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        p_user_id: "b35822c2-e517-4c2f-95bd-93a9f2412dba",
        p_limit: 15
      })
    });
    
    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Body:", text);
  } catch (e) {
    console.error("Fetch fail:", e);
  }
}
checkRpc();
