const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

puppeteer.use(StealthPlugin());
const app = express();

// מאפשר לכל אתר (ול-Frontend שלך) לגשת למידע
app.use(cors());

const db = new sqlite3.Database('./properties.db');
const delay = ms => new Promise(res => setTimeout(res, ms));

// אתחול מסד נתונים
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS houses (
        id TEXT PRIMARY KEY,
        address TEXT,
        description TEXT,
        price INTEGER,
        phone TEXT,
        images TEXT,
        source TEXT,
        urban_renewal TEXT,
        lat REAL,
        lon REAL,
        last_seen DATETIME
    )`);
});

const checkRenewal = (text) => {
    const streets = ["התרסי", "יוספטל", "שפירא", "בנימין", "הרצל", "ההסתדרות", "בן גוריון", "רמת אשכול", "עלי", "דוד רזיאל"];
    return streets.some(s => text?.includes(s)) ? "✅ פינוי בינוי" : "רגיל";
};

// Geocoding
async function getCoordinates(address) {
    try {
        let cleanAddress = address.replace('באשקלון', '').replace("רח'", "").trim();
        if (!cleanAddress.includes(" ")) {
            cleanAddress = "שכונת " + cleanAddress;
        }

        const query = encodeURIComponent(cleanAddress + ", אשקלון, ישראל");
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}`;
        
        const response = await fetch(url, { headers: { 'User-Agent': 'AshkelonRealEstateBot/1.0' } });
        const data = await response.json();
        
        if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch (e) {
        console.error("Geocoding failed for:", address);
    }
    return { lat: 31.6688, lon: 34.5744 };
}

// --- סורק יד 2 ---
async function scrapeYad2(page) {
    console.log("סורק יד 2...");
    try {
        await page.goto('https://www.yad2.co.il/realestate/forsale/south?area=21&city=7100', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);

        const adLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/item/"]')).map(a => a.href).filter((v, i, a) => a.indexOf(v) === i);
        });

        const results = [];
        for (let link of adLinks.slice(0, 8)) {
            try {
                await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
                await delay(3000);
                
                let phone = "באתר";
                try {
                    const phoneBtn = await page.$('[data-testid="show-ad-contacts-button"], [data-testid="contact-button"]');
                    if (phoneBtn) {
                        await phoneBtn.click();
                        await delay(1500);
                        phone = await page.$eval('.phone-number-link_phoneNumberText__ayXOk, [data-testid="phone-number"]', el => el.innerText).catch(() => "באתר");
                    }
                } catch(e) {}

                const details = await page.evaluate(() => {
                    const nextDataTag = document.getElementById('__NEXT_DATA__');
                    if (nextDataTag) {
                        try {
                            const data = JSON.parse(nextDataTag.innerText).props.pageProps.dehydratedState.queries[0].state.data;
                            return {
                                id: 'yad2_' + data.token,
                                address: `${data.address.street?.text || ''} ${data.address.neighborhood?.text || ''}, אשקלון`,
                                price: data.price || 0,
                                description: data.description || data.metaData?.description || "",
                                images: JSON.stringify(data.metaData?.images || []),
                                lat: data.address.coords?.lat || null,
                                lon: data.address.coords?.lon || null
                            };
                        } catch(e) {}
                    }
                    return null;
                });

                if (details && details.address) {
                    results.push({ ...details, phone, source: "Yad2" });
                }
            } catch (e) { console.log(`שגיאה במודעת יד 2, מדלג...`); }
        }
        return results;
    } catch (e) {
        console.log("שגיאה כללית בסריקת יד 2. ממשיך הלאה.");
        return [];
    }
}

// --- סורק מדלן ---
async function scrapeMadlan(page) {
    console.log("סורק מדלן...");
    try {
        await page.goto('https://www.madlan.co.il/for-sale/אשקלון-ישראל', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(4000);
        return await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[data-auto="listed-bulletin"]')).map(card => ({
                id: 'madlan_' + Math.random().toString(36).substr(2, 9),
                address: card.querySelector('[data-auto="property-address"]')?.innerText || "אשקלון",
                price: parseInt(card.querySelector('[data-auto="property-price"]')?.innerText.replace(/\D/g, '')) || 0,
                description: card.querySelector('.css-ncbygp')?.innerText || "",
                phone: "באתר מדלן",
                images: JSON.stringify([card.querySelector('img')?.src]),
                source: "Madlan", lat: null, lon: null
            }));
        });
    } catch(e) {
        console.log("שגיאה במדלן. ממשיך הלאה.");
        return [];
    }
}

// --- סורק קומו ---
async function scrapeKomo(page) {
    console.log("סורק קומו...");
    try {
        await page.goto('https://www.komo.co.il/code/nadlan/apartments-for-sale.asp?cityName=אשקלון', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(3000);
        return await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.modaaRow')).map(row => ({
                id: 'komo_' + (row.id || Math.random()),
                address: row.querySelector('.LinkModaaTitle')?.innerText.split(',')[1]?.trim() || "אשקלון",
                price: parseInt(row.querySelector('.tdPrice')?.innerText.replace(/\D/g, '')) || 0,
                description: row.querySelector('.tdMoreDetails')?.innerText || "",
                phone: "באתר קומו",
                images: JSON.stringify([row.querySelector('.tdGallery img')?.src]),
                source: "Komo", lat: null, lon: null
            }));
        });
    } catch(e) {
        console.log("שגיאה בקומו. ממשיך הלאה.");
        return [];
    }
}

// --- סורק כונס אונליין ---
async function scrapeKones(page) {
    console.log("סורק כונס נכסים...");
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto('https://www.konesonline.co.il/boards/asset?CityId=75', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('.tender_item', { timeout: 10000 }).catch(() => {});
        await delay(2000);
        
        return await page.evaluate(() => {
            const items = document.querySelectorAll('.tender_item');
            const results = [];
            items.forEach(item => {
                const titleEl = item.querySelector('.title');
                const dateEl = item.querySelector('.date');
                const imgEl = item.querySelector('.image_conti');
                
                if (titleEl) {
                    let address = titleEl.innerText.trim();
                    let desc = dateEl ? `מועד סיום מכרז: ${dateEl.innerText.trim()}` : "מכרז כונס";
                    let imageUrl = imgEl && imgEl.style.backgroundImage ? imgEl.style.backgroundImage.slice(4, -1).replace(/["']/g, "") : "";

                    results.push({
                        id: 'kones_' + Math.random().toString(36).substr(2, 9),
                        address: address,
                        price: 0,
                        description: desc,
                        phone: "באתר כונס",
                        images: JSON.stringify([imageUrl]),
                        source: "Kones", lat: null, lon: null
                    });
                }
            });
            return results;
        });
    } catch (error) {
        console.log("כונס אונליין לא זמין כרגע. ממשיך הלאה...");
        return []; 
    }
}

// מנוע הסריקה הראשי
async function runMasterScraper() {
    console.log("🚀 מתחיל סריקה כוללת בענן...");
    // הגדרות קריטיות לריצה על שרתי Render החינמיים!
    const browser = await puppeteer.launch({
        headless: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // חוסם טעינת פרסומות ופונטים כדי לחסוך בזיכרון של השרת
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        const results = [
            ...(await scrapeYad2(page)),
            ...(await scrapeMadlan(page)),
            ...(await scrapeKomo(page)),
            ...(await scrapeKones(page))
        ];

        const stmt = db.prepare(`INSERT OR REPLACE INTO houses (id, address, description, price, phone, images, source, urban_renewal, lat, lon, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);

        console.log("משלים נתוני מיקום חסרים...");
        for (const h of results) {
            if (h.address && h.address.trim() !== "") {
                let finalLat = h.lat;
                let finalLon = h.lon;
                
                if (!finalLat || !finalLon) {
                    const coords = await getCoordinates(h.address);
                    finalLat = coords.lat;
                    finalLon = coords.lon;
                    await delay(1000);
                }

                const renewal = checkRenewal(h.address + h.description);
                stmt.run(h.id, h.address, h.description, h.price, h.phone, h.images, h.source, renewal, finalLat, finalLon);
            }
        }
        stmt.finalize();
        console.log("✅ הסריקה הסתיימה בהצלחה והנתונים נשמרו!");
    } catch (e) { 
        console.error("שגיאה במנוע הראשי:", e); 
    } finally {
        await browser.close();
    }
}

// ניתובים של ה-API
app.get('/api/run-scrape', (req, res) => { 
    runMasterScraper(); 
    res.json({ message: "Started background scraping on Render" }); 
});

app.get('/api/properties', (req, res) => { 
    db.all("SELECT * FROM houses ORDER BY last_seen DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []); 
    }); 
});

// שימוש בפורט הדינמי ש-Render מקצה לנו (או 5000 ברירת מחדל בבית)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend is running on port ${PORT}`));
