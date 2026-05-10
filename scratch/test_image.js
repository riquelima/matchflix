import fetch from 'node-fetch';
import fs from 'fs';

async function testImageProxy() {
    const targetPath = "/9X2G5lFw0Kq4VEXk308Jj1yQdUr.jpg"; // Example path
    const localUrl = `http://localhost:5173/api/image?w=500&path=${targetPath}`;
    
    try {
        console.log("Fetching local image via Vite Proxy:", localUrl);
        const res = await fetch(localUrl);
        console.log("Status:", res.status);
        console.log("Headers:", JSON.stringify(res.headers.raw(), null, 2));
        
        if (res.status === 200) {
            const buf = await res.arrayBuffer();
            console.log("Successfully retrieved buffer size:", buf.byteLength);
            fs.writeFileSync("test_output.webp", Buffer.from(buf));
            console.log("Wrote output file successfully.");
        }
    } catch(e) {
        console.error("Fetch failure:", e);
    }
}

testImageProxy();
