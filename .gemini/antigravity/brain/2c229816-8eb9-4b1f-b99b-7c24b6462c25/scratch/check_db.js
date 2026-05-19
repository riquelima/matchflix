const url = "https://kewwqxfpjzrxduhoqfxw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";

async function run() {
    try {
        console.log("Fetching unique usuario_id from curtidas_filmes...");
        const response = await fetch(`${url}/rest/v1/curtidas_filmes?select=usuario_id,filme_id,assistido,curtiu&limit=100`, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        });
        if (!response.ok) {
            console.error("HTTP Error:", response.status, await response.text());
            return;
        }
        const data = await response.json();
        console.log("Sample records count:", data.length);
        if (data.length > 0) {
            console.log("Sample records:", data.slice(0, 10));
        }
        
        // Count unique users
        const users = new Set(data.map(d => d.usuario_id));
        console.log("Unique user IDs found:", Array.from(users));
        
        for (const userId of users) {
            const userRecs = data.filter(d => d.usuario_id === userId);
            console.log(`User ${userId}: total records in sample = ${userRecs.length}`);
            console.log(` - Watched (assistido = true):`, userRecs.filter(r => r.assistido === true).map(r => r.filme_id));
            console.log(` - Liked (curtiu = true):`, userRecs.filter(r => r.curtiu === true).map(r => r.filme_id));
        }
    } catch (e) {
        console.error(e);
    }
}

run();
