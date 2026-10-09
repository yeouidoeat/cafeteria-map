// 지역 이름으로 구내식당 후보를 카카오 장소 검색에서 찾아 돌려줍니다.
// 필요한 Vercel 환경 변수: KAKAO_REST_KEY, ADMIN_PASSWORD

const QUERIES = ['구내식당', '직원식당', '한식뷔페'];
const MAX_PAGES = 3; // 검색어당 최대 45곳 (15개 x 3페이지)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
  }
  if (!process.env.KAKAO_REST_KEY) return res.status(500).json({ error: 'KAKAO_REST_KEY가 설정되지 않았어요.' });

  const region = String((req.body && req.body.region) || '').trim();
  if (!region) return res.status(400).json({ error: '지역을 입력해 주세요.' });

  const found = new Map();
  try {
    for (const q of QUERIES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?size=15&page=' + page +
          '&query=' + encodeURIComponent(region + ' ' + q);
        const r = await fetch(url, { headers: { Authorization: 'KakaoAK ' + process.env.KAKAO_REST_KEY } });
        if (!r.ok) {
          const t = await r.text();
          return res.status(502).json({ error: '카카오 검색 실패 (' + r.status + '): ' + t.slice(0, 200) });
        }
        const data = await r.json();
        for (const d of data.documents || []) {
          if (!found.has(d.id)) {
            found.set(d.id, {
              kakaoId: d.id,
              name: d.place_name,
              address: d.road_address_name || d.address_name,
              jibun: d.address_name,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
              category: d.category_name,
              phone: d.phone,
              placeUrl: d.place_url,
              query: q,
            });
          }
        }
        if (!data.meta || data.meta.is_end) break;
      }
    }
  } catch (e) {
    return res.status(500).json({ error: '검색 중 오류: ' + e.message });
  }

  return res.status(200).json({ region, candidates: [...found.values()] });
};
