"use strict";

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = 3000;

/**
 * Melakukan pencarian video di YouTube via scraping
 * @param {string} query - Kata kunci pencarian
 * @returns {Promise<Array<Object>>} - Array objek berisi data video
 */
async function youtubeSearch(query) {
    if (!query || typeof query !== "string" || query.trim().length === 0) {
        throw new Error("Parameter 'query' harus berupa string dan tidak boleh kosong.");
    }

    try {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
        const { data: html } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });

        const $ = cheerio.load(html);
        let initialData = null;

        $("script").each((_, element) => {
            const scriptText = $(element).html();
            if (scriptText && scriptText.includes("var ytInitialData =")) {
                const jsonText = scriptText
                    .split("var ytInitialData =")[1]
                    .split(";</script>")[0]
                    .split(";")[0]
                    .trim();
                try {
                    initialData = JSON.parse(jsonText);
                } catch (err) {
                    initialData = null;
                }
            }
        });

        if (!initialData) {
            throw new Error("Gagal mengekstrak data dari YouTube.");
        }

        const contents = initialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        if (!contents) return [];

        const results = [];

        for (const item of contents) {
            const itemSection = item.itemSectionRenderer?.contents;
            if (!itemSection) continue;

            for (const video of itemSection) {
                const videoData = video.videoRenderer;
                if (!videoData) continue;

                const videoId = videoData.videoId;
                const title = videoData.title?.runs?.[0]?.text || "";
                const duration = videoData.lengthText?.simpleText || "N/A";
                const views = videoData.viewCountText?.simpleText || videoData.shortViewCountText?.simpleText || "0 views";
                const publishedAt = videoData.publishedTimeText?.simpleText || "";
                const author = videoData.ownerText?.runs?.[0]?.text || "";
                const authorUrl = videoData.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url 
                    ? `https://www.youtube.com${videoData.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}`
                    : "";
                const thumbnail = videoData.thumbnail?.thumbnails?.slice(-1)[0]?.url || "";

                results.push({
                    type: "video",
                    id: videoId,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title,
                    description: videoData.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join("") || "",
                    duration,
                    views,
                    publishedAt,
                    author: {
                        name: author,
                        url: authorUrl
                    },
                    thumbnail
                });
            }
        }

        return results;
    } catch (error) {
        throw new Error(`Error saat scraping YouTube: ${error.message}`);
    }
}

// Endpoint GET /yt/s?q=
app.get("/yt/s", async (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            status: false,
            error: "Parameter 'q' wajib diisi. Contoh: /yt/s?q=sc%20bot"
        });
    }

    try {
        const results = await youtubeSearch(query);
        
        if (results.length === 0) {
            return res.status(404).json({
                status: false,
                message: "Hasil pencarian tidak ditemukan."
            });
        }

        return res.json({
            status: true,
            total: results.length,
            data: results
        });
    } catch (error) {
        return res.status(500).json({
            status: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log(`Test endpoint: http://localhost:${PORT}/yt/s?q=sc+bot`);
});
