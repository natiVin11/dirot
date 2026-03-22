import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const PLACEHOLDER_IMG = "https://images.placeholders.dev/?width=400&height=250&text=No%20Image&bgColor=%23f1f5f9&textColor=%2394a3b8";

// הכתובת של השרת שלך בענן
const API_URL = "https://dirot-g4rs.onrender.com";

function App() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedAd, setSelectedAd] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState("grid");
    const [serverError, setServerError] = useState(false);

    const AVG_PRICE_ASHKELON = 1750000;
    const ASHKELON_CENTER = [31.6688, 34.5744];

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/properties`);
            if (!res.ok) throw new Error("Server Error");
            const data = await res.json();
            setProperties(Array.isArray(data) ? data : []);
            setServerError(false);
        } catch (err) {
            console.error("Error fetching properties:", err);
            setServerError(true);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredProperties = useMemo(() => {
        return properties.filter(p =>
            (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.source && p.source.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [properties, searchTerm]);

    const stats = useMemo(() => {
        const total = properties.length;
        const bargains = properties.filter(p => p.price > 0 && p.price < AVG_PRICE_ASHKELON).length;
        const kones = properties.filter(p => p.source === 'Kones').length;
        return { total, bargains, kones };
    }, [properties]);

    const startScrape = async () => {
        setLoading(true);
        try {
            await fetch(`${API_URL}/api/run-scrape`);
            const interval = setInterval(fetchData, 10000);
            setTimeout(() => { clearInterval(interval); setLoading(false); }, 120000);
        } catch (err) {
            alert("השרת לא מגיב. ודא שהוא מופעל ואין שגיאות.");
            setLoading(false);
        }
    };

    const getMarkerIcon = (price, source) => {
        let color = '#ef4444'; // מעל הממוצע (אדום)
        if (source === 'Kones') color = '#eab308'; // כונס (כתום-צהוב)
        else if (price > 0 && price < AVG_PRICE_ASHKELON) color = '#22c55e'; // מתחת לממוצע (ירוק)
        
        return new L.DivIcon({
            className: 'custom-marker',
            html: `<div style="background-color:${color}; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
    };

    const handleImgError = (e) => {
        if (e.target.src !== PLACEHOLDER_IMG) {
            e.target.onerror = null;
            e.target.src = PLACEHOLDER_IMG;
        }
    };

    return (
        <div style={{ direction: 'rtl', padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', textAlign: 'right' }}>
            {serverError && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: '10px', borderRadius: '10px', marginBottom: '20px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #f87171' }}>
                    שגיאת תקשורת: השרת לא מגיב. ודא שהאפליקציה פועלת ב-Render.
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#1e293b' }}>צייד הנדל"ן - אשקלון</h1>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius:'10px' }}>📊 {stats.total} נכסים</span>
                        <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 'bold', background: '#f0fdf4', padding: '4px 10px', borderRadius:'10px' }}>💎 {stats.bargains} מציאות</span>
                        <span style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 'bold', background: '#fef3c7', padding: '4px 10px', borderRadius:'10px' }}>⚖️ {stats.kones} כינוס נכסים</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input type="text" placeholder="חיפוש חופשי..." onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none' }} />
                    <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '10px', display: 'flex' }}>
                        <button onClick={() => setViewMode("grid")} style={{ padding: '8px 16px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: viewMode === "grid" ? 'white' : 'transparent', fontWeight: 'bold' }}>רשימה</button>
                        <button onClick={() => setViewMode("map")} style={{ padding: '8px 16px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: viewMode === "map" ? 'white' : 'transparent', fontWeight: 'bold' }}>מפה 📍</button>
                    </div>
                    <button onClick={startScrape} disabled={loading} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {loading ? 'סורק את הרשת...' : 'סריקה מקיפה'}
                    </button>
                </div>
            </div>

            {viewMode === "grid" ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {filteredProperties.map(p => {
                        let images = [];
                        try { images = p.images ? JSON.parse(p.images) : []; } catch(e) {}
                        const mainImg = (images.length > 0 && images[0]) ? images[0] : PLACEHOLDER_IMG;

                        return (
                            <div key={p.id} onClick={() => setSelectedAd(p)} style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                                <img src={mainImg} style={{ width: '100%', height: '180px', objectFit: 'cover' }} alt="דירה" onError={handleImgError} />
                                <div style={{ padding: '15px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '5px' }}>
                                        <span style={{ background: p.source === 'Kones' ? '#fef3c7' : '#eff6ff', color: p.source === 'Kones' ? '#b45309' : '#2563eb', padding: '2px 8px', borderRadius: '5px' }}>{p.source}</span>
                                        <span style={{ color: '#94a3b8' }}>{p.last_seen ? new Date(p.last_seen).toLocaleDateString('he-IL') : ''}</span>
                                    </div>
                                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address}</h3>
                                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: p.source === 'Kones' ? '#b45309' : '#15803d' }}>
                                        {p.source === 'Kones' ? 'מכרז כונס' : (p.price > 0 ? `${p.price.toLocaleString()} ₪` : 'מחיר בפרטי')}
                                    </div>
                                    {p.urban_renewal && p.urban_renewal.includes('✅') && (
                                        <div style={{ marginTop: '10px', fontSize: '0.8rem', background: '#dcfce7', color: '#166534', padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                                            🏗️ פוטנציאל פינוי בינוי
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ height: '70vh', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <MapContainer center={ASHKELON_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {filteredProperties.filter(p => p.lat && p.lon).map(p => (
                            <Marker key={p.id} position={[p.lat, p.lon]} icon={getMarkerIcon(p.price, p.source)}>
                                <Popup>
                                    <div style={{ textAlign: 'right', fontFamily: 'sans-serif' }}>
                                        <strong style={{ fontSize: '1.1rem' }}>{p.address}</strong><br />
                                        <span style={{ color: p.source === 'Kones' ? '#b45309' : '#059669', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                            {p.source === 'Kones' ? 'מכרז כונס' : (p.price > 0 ? `${p.price.toLocaleString()} ₪` : 'מחיר בפרטי')}
                                        </span><br />
                                        <button onClick={() => setSelectedAd(p)} style={{ marginTop: '8px', padding: '5px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '100%' }}>לפרטים מורחבים</button>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            )}

            {/* Modal - חלון פרטי נכס */}
            {selectedAd && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.9)', zIndex: 4000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedAd(null)}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: '30px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelectedAd(null)} style={{ position: 'absolute', top: '20px', left: '20px', border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>

                        <h2 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>{selectedAd.address}</h2>
                        <p style={{ color: selectedAd.source === 'Kones' ? '#b45309' : '#2563eb', fontWeight: 'bold', marginTop: 0 }}>מקור: {selectedAd.source}</p>

                        <div style={{ display: 'flex', gap: '15px', margin: '20px 0' }}>
                            <button onClick={() => window.open(`https://wa.me/972${selectedAd.phone?.replace(/\D/g,'')}?text=שלום, אני פונה לגבי ${selectedAd.source==='Kones'?'המכרז':'הדירה'} ב${selectedAd.address}`)}
                                    style={{ flex: 1, padding: '15px', backgroundColor: '#25d366', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>WhatsApp 📱</button>
                            <div style={{ flex: 1, background: '#f8fafc', padding: '15px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #e2e8f0', fontSize: '1.1rem' }}>📞 {selectedAd.phone || 'אין טלפון'}</div>
                        </div>

                        <p style={{ lineHeight: '1.6', background: '#f1f5f9', padding: '15px', borderRadius: '12px', fontWeight: selectedAd.source === 'Kones' ? 'bold' : 'normal', whiteSpace: 'pre-wrap' }}>{selectedAd.description}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
                            {(() => {
                                try {
                                    const imgs = selectedAd.images ? JSON.parse(selectedAd.images) : [];
                                    return imgs.map((img, i) => img && <img key={i} src={img} style={{ width: '100%', borderRadius: '12px' }} onError={handleImgError} />);
                                } catch(e) { return null; }
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
