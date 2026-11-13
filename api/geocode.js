// 카카오 Geocoding API - 주소로 좌표 찾기
export default async function handler(req, res) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { address, query } = req.body;
  const searchText = address || query;
  
  if (!searchText) {
    return res.status(400).json({ error: '주소 또는 검색어 필요' });
  }

  const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
  if (!KAKAO_REST_KEY) {
    return res.status(500).json({ error: 'KAKAO_REST_KEY 미설정' });
  }

  try {
    // 1차: 주소 검색 (정확한 주소일 때)
    let response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(searchText)}`,
      {
        headers: {
          'Authorization': `KakaoAK ${KAKAO_REST_KEY}`
        }
      }
    );

    let data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      const result = data.documents[0];
      return res.status(200).json({
        success: true,
        method: 'address',
        lat: parseFloat(result.y),
        lng: parseFloat(result.x),
        address: result.address_name,
        roadAddress: result.road_address?.address_name || '',
        placeName: null
      });
    }

    // 2차: 키워드 검색 (장소명, 상호명일 때)
    response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchText)}&size=5`,
      {
        headers: {
          'Authorization': `KakaoAK ${KAKAO_REST_KEY}`
        }
      }
    );

    data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      const result = data.documents[0];
      
      // 검색 결과 여러 개면 리스트도 반환
      const results = data.documents.slice(0, 5).map(d => ({
        lat: parseFloat(d.y),
        lng: parseFloat(d.x),
        address: d.address_name || '',
        roadAddress: d.road_address_name || '',
        placeName: d.place_name || '',
        category: d.category_name || ''
      }));
      
      return res.status(200).json({
        success: true,
        method: 'keyword',
        lat: parseFloat(result.y),
        lng: parseFloat(result.x),
        address: result.address_name || '',
        roadAddress: result.road_address_name || '',
        placeName: result.place_name || '',
        category: result.category_name || '',
        results // 선택 가능한 여러 결과
      });
    }

    return res.status(404).json({ 
      success: false,
      error: '검색 결과 없음. 주소나 장소명을 다시 확인해주세요.'
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
