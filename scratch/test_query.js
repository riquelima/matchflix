const TMDB_API_KEY = "416394469462693ee5727abe4c864848";

async function testQuery() {
    const qs = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'pt-BR',
        sort_by: 'popularity.desc',
        'vote_count.gte': 100,
        page: 1,
        with_genres: '27',
        'vote_average.gte': '7',
        watch_region: 'BR',
        with_watch_providers: '8',
        with_watch_monetization_types: 'flatrate'
    });
    
    try {
        const url = `https://api.themoviedb.org/3/discover/movie?${qs.toString()}`;
        console.log("Fetching URL:", url);
        const r = await fetch(url);
        const data = await r.json();
        console.log("Status:", r.status);
        console.log("Results count:", data.results ? data.results.length : 0);
        if (data.results && data.results.length > 0) {
            console.log("First movie title:", data.results[0].title);
            console.log("First movie vote:", data.results[0].vote_average);
            console.log("First movie genres:", data.results[0].genre_ids);
        } else {
            console.log("Data returned:", JSON.stringify(data));
        }
    } catch(e) {
        console.error("Error:", e);
    }
}

testQuery();
