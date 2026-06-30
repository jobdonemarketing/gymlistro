(function() {
    'use strict';

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const clearBtn = document.getElementById('clearBtn');
    const resultsContainer = document.getElementById('results');
    const noResultsContainer = document.getElementById('noResults');
    const searchStatus = document.getElementById('searchStatus');

    let gymsData = null;
    let isSearching = false;
    let currentQuery = '';

    // ===== NORMALIZATION (FIXED) =====
    function normalize(str) {
        return str.trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
            .replace(/[șş]/g, 's').replace(/[țţ]/g, 't')        // Romanian S/T with cedilla/comma
            .replace(/[ăâ]/g, 'a').replace(/[î]/g, 'i')          // Romanian A/I variants
            .replace(/[-–—]/g, ' ')                               // hyphens, en-dash, em-dash → space
            .replace(/\s+/g, ' ')                                 // collapse multiple spaces
            .trim();
    }

    // ===== CREATE SLUG FOR URL =====
    function createSlug(city) {
        return normalize(city).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // ===== INJECT JSON-LD SCHEMA =====
    function injectSchema(gyms, city) {
        document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());

        if (!gyms || gyms.length === 0) return;

        const itemList = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": `Cele mai bune săli de sport din ${city}`,
            "description": `Listă cu săli de sport verificate anonim în ${city}, evaluate pe 5 criterii: igienă, echipament, atmosferă, profesionalism și facilități.`,
            "numberOfItems": gyms.length,
            "itemListElement": gyms.map((g, index) => {
                const scores = [
                    g.score_igiena || 0,
                    g.score_echipament || 0,
                    g.score_atmosfera || 0,
                    g.score_profesionalism || 0,
                    g.score_facilitati || 0
                ];
                const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                const ratingValue = (avgScore / 10) * 5;
                const roundedRating = Math.round(ratingValue * 10) / 10;

                return {
                    "@type": "ListItem",
                    "position": index + 1,
                    "item": {
                        "@type": "LocalBusiness",
                        "name": g.name,
                        "address": {
                            "@type": "PostalAddress",
                            "streetAddress": g.address || '',
                            "addressLocality": g.city,
                            "postalCode": g.postal_code || '',
                            "addressCountry": "RO"
                        },
                        "telephone": g.phone || '',
                        "url": g.website && g.website !== '#' ? g.website : `https://gymlist.ro/?city=${createSlug(g.city)}`,
                        "image": g.image || '',
                        "description": g.description || '',
                        "aggregateRating": {
                            "@type": "AggregateRating",
                            "ratingValue": roundedRating,
                            "reviewCount": 10,
                            "bestRating": "5",
                            "worstRating": "1"
                        },
                        "openingHours": "Mo-Su 06:00-23:00"
                    }
                };
            })
        };

        const script = document.createElement('script');
        script.setAttribute('data-gymlist-schema', 'true');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(itemList);
        document.head.appendChild(script);
    }

    // ===== LOAD DATA =====
    function loadData() {
        searchStatus.innerHTML = '<div class="loading-spinner"><span class="spinner"></span> Încărcăm lista de săli...</div>';
        fetch('data/sali.json')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                gymsData = data;
                searchStatus.innerHTML = '';
                searchBtn.disabled = false;
                toggleClearBtn();

                const urlParams = new URLSearchParams(window.location.search);
                const cityParam = urlParams.get('city');
                if (cityParam) {
                    searchInput.value = cityParam;
                    setTimeout(performSearch, 300);
                }
            })
            .catch(err => {
                console.error('Failed to load gym data:', err);
                searchStatus.innerHTML = '<p style="color:#EF4444;">⚠️ Nu am putut încărca lista de săli. Te rugăm să reîncarci pagina.</p>';
                searchBtn.disabled = true;
            });
    }

    // ===== TOGGLE CLEAR BUTTON =====
    function toggleClearBtn() {
        clearBtn.style.display = searchInput.value.length > 0 ? 'block' : 'none';
    }

    // ===== RENDER RESULTS =====
    function renderResults(gyms, query) {
        resultsContainer.style.display = 'none';
        noResultsContainer.style.display = 'none';

        document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());

        if (!gyms || gyms.length === 0) {
            noResultsContainer.style.display = 'block';
            return;
        }

        injectSchema(gyms, query);

        resultsContainer.style.display = 'grid';
        resultsContainer.innerHTML = gyms.map(g => {
            const statusHtml = g.approved
                ? '<span class="status-badge approved">Aprobat Gymlist</span>'
                : '<span class="status-badge pending">În așteptare</span>';

            const phone = g.phone ? `<a href="tel:${g.phone}" class="phone-link">📞 Sună</a>` : '';
            const maps = g.address ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.address + ', ' + g.city)}" target="_blank" rel="noopener">🗺️ Hartă</a>` : '';
            const website = g.website && g.website !== '#' ? `<a href="${g.website}" target="_blank" rel="noopener">🌐 Site</a>` : '';
            const video = g.video_url && g.video_url !== '#' ? `<a href="${g.video_url}" target="_blank" rel="noopener">🎥 Video</a>` : '';

            const altText = `Sală ${g.name} în ${g.city}`;

            return `
                <div class="gym-card">
                    <img class="card-image" src="${g.image || 'https://via.placeholder.com/400x200?text=🏋️'}" alt="${altText}" loading="lazy">
                    <div class="card-body">
                        <div class="card-header">
                            <span class="card-name">${g.name}</span>
                            ${statusHtml}
                        </div>
                        <div class="card-address">📍 ${g.address}, ${g.city} (${g.postal_code})</div>
                        ${g.description ? `<p class="card-description">${g.description}</p>` : ''}
                        <div class="card-actions">
                            ${phone}
                            ${maps}
                            ${website}
                            ${video}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== PERFORM SEARCH (FIXED) =====
    function performSearch() {
        if (isSearching) return;
        if (!gymsData) {
            searchStatus.innerHTML = '<p style="color:#EF4444;">⏳ Datele se încarcă. Încearcă din nou în câteva secunde.</p>';
            return;
        }

        const rawQuery = searchInput.value;
        if (!rawQuery.trim()) {
            searchInput.focus();
            searchStatus.innerHTML = '<p style="color:#EF4444;">Te rugăm să introduci un oraș sau cod poștal.</p>';
            resultsContainer.style.display = 'none';
            noResultsContainer.style.display = 'none';
            document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());
            return;
        }

        isSearching = true;
        searchBtn.disabled = true;
        searchBtn.textContent = '⏳ Căutăm...';
        searchStatus.innerHTML = '<div class="loading-spinner"><span class="spinner"></span> Căutăm...</div>';

        setTimeout(() => {
            const query = normalize(rawQuery);

            const filtered = gymsData.filter(g => {
                const cityNorm = normalize(g.city);
                const postalNorm = normalize(g.postal_code);
                const nameNorm = normalize(g.name);
                const addressNorm = normalize(g.address || '');

                // Match city (full or partial), postal code (starts with or exact), name, or address
                return cityNorm.includes(query) ||
                       postalNorm.includes(query) ||     // ← changed from startsWith to includes for partial postcode
                       nameNorm.includes(query) ||
                       addressNorm.includes(query);
            });

            filtered.sort((a, b) => {
                if (a.approved && !b.approved) return -1;
                if (!a.approved && b.approved) return 1;
                return a.name.localeCompare(b.name);
            });

            let cityForUrl = rawQuery.trim();
            if (filtered.length > 0) {
                cityForUrl = filtered[0].city;
            }
            const slug = createSlug(cityForUrl);
            const newUrl = window.location.pathname + '?city=' + encodeURIComponent(slug);
            window.history.pushState({ city: cityForUrl }, '', newUrl);

            renderResults(filtered, cityForUrl);

            const count = filtered.length;

            if (count > 0) {
                searchStatus.innerHTML = `<p style="color:#22C55E;">✅ Am găsit ${count} săli în această zonă.</p>`;
            } else {
                searchStatus.innerHTML = '';
            }

            searchBtn.textContent = '🔍 Găsește Săli';
            searchBtn.disabled = false;
            isSearching = false;
            currentQuery = rawQuery;
        }, 300);
    }

    // ===== EVENT LISTENERS =====
    searchBtn.addEventListener('click', performSearch);

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });

    searchInput.addEventListener('input', function() {
        toggleClearBtn();
        if (!this.value.trim()) {
            resultsContainer.style.display = 'none';
            noResultsContainer.style.display = 'none';
            searchStatus.innerHTML = '';
            document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());
            const cleanUrl = window.location.pathname;
            window.history.pushState({}, '', cleanUrl);
        }
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchInput.focus();
        toggleClearBtn();
        resultsContainer.style.display = 'none';
        noResultsContainer.style.display = 'none';
        searchStatus.innerHTML = '';
        document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());
        const cleanUrl = window.location.pathname;
        window.history.pushState({}, '', cleanUrl);
    });

    document.querySelectorAll('.search-hint span').forEach(span => {
        span.addEventListener('click', function() {
            searchInput.value = this.textContent.trim();
            toggleClearBtn();
            performSearch();
        });
    });

    // ===== HANDLE BROWSER BACK/FORWARD =====
    window.addEventListener('popstate', function(e) {
        const urlParams = new URLSearchParams(window.location.search);
        const cityParam = urlParams.get('city');
        if (cityParam) {
            searchInput.value = cityParam;
            setTimeout(performSearch, 100);
        } else {
            searchInput.value = '';
            resultsContainer.style.display = 'none';
            noResultsContainer.style.display = 'none';
            searchStatus.innerHTML = '';
            document.querySelectorAll('script[data-gymlist-schema]').forEach(el => el.remove());
        }
    });

    // ===== INIT =====
    loadData();

})();
