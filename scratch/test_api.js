async function test() {
    try {
        const res = await fetch('http://localhost:5174/api/movies?endpoint=discover/movie&vote_count.gte=100');
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Movie count returned:", data.results ? data.results.length : 0);
        if (data.results && data.results.length > 0) {
            console.log("First movie:", data.results[0].title);
        } else {
            console.log("No movies. Full response:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

test();
