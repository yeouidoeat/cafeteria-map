// 식당 리스트 조회 (index.html에서 파싱)
export default async function handler(req, res) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'yeouidoeat/cafeteria-map';
  const FILE_PATH = 'index.html';
  
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN 미설정' });
  }

  try {
    // index.html 가져오기
    const getRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!getRes.ok) {
      const errData = await getRes.json();
      return res.status(500).json({ error: 'GitHub 파일 조회 실패: ' + errData.message });
    }

    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

    // cafeterias 배열 찾기
    const arrayMatch = content.match(/const cafeterias = \[/);
    if (!arrayMatch) {
      return res.status(500).json({ error: 'cafeterias 배열을 찾을 수 없음' });
    }

    const arrayStart = arrayMatch.index + 'const cafeterias = '.length;
    
    // 배열 끝 찾기
    let bracketCount = 0;
    let arrayEnd = -1;
    let inString = false;
    let stringChar = null;
    
    for (let i = arrayStart; i < content.length; i++) {
      const ch = content[i];
      const prevCh = i > 0 ? content[i-1] : '';
      
      if (!inString && (ch === '"' || ch === "'")) {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (inString && ch === stringChar && prevCh !== '\\') {
        inString = false;
        stringChar = null;
        continue;
      }
      if (inString) continue;
      
      if (ch === '[') bracketCount++;
      if (ch === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          arrayEnd = i;
          break;
        }
      }
    }
    
    if (arrayEnd === -1) {
      return res.status(500).json({ error: '배열 끝을 찾을 수 없음' });
    }

    // 배열 안의 각 식당 객체 파싱
    const arrayContent = content.substring(arrayStart + 1, arrayEnd);
    const cafeterias = [];
    
    // 객체 단위로 분리
    let depth = 0;
    let objStart = -1;
    let inStr = false;
    let strCh = null;
    
    for (let i = 0; i < arrayContent.length; i++) {
      const ch = arrayContent[i];
      const prevCh = i > 0 ? arrayContent[i-1] : '';
      
      if (!inStr && (ch === '"' || ch === "'")) {
        inStr = true;
        strCh = ch;
        continue;
      }
      if (inStr && ch === strCh && prevCh !== '\\') {
        inStr = false;
        strCh = null;
        continue;
      }
      if (inStr) continue;
      
      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
      }
      if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const objStr = arrayContent.substring(objStart, i + 1);
          const parsed = parseObject(objStr);
          if (parsed && parsed.id) {
            cafeterias.push(parsed);
          }
          objStart = -1;
        }
      }
    }

    // 각 식당에 region 추가
    cafeterias.forEach(c => {
      c.region = extractRegion(c.address);
    });
    
    // 지역별 카운트
    const regionCounts = {};
    cafeterias.forEach(c => {
      regionCounts[c.region] = (regionCounts[c.region] || 0) + 1;
    });
    
    // 지역 정렬 (많은 순)
    const regionStats = Object.entries(regionCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({ 
      cafeterias,
      total: cafeterias.length,
      regionStats
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// 주소에서 "구" 또는 "시" 추출
function extractRegion(address) {
  if (!address) return '기타';
  
  // 서울특별시/서울/경기도/경기/인천/부산 등 제거
  const cleaned = address.replace(/^(서울특별시|서울|경기도|경기|인천광역시|인천|부산광역시|부산|대전|대구|광주)\s*/, '');
  
  // "XX구" 추출 (가장 먼저 나오는 "구")
  const guMatch = cleaned.match(/^([가-힣]+구)/);
  if (guMatch) return guMatch[1];
  
  // "XX시" 추출 (경기도 지역 등)
  const siMatch = cleaned.match(/^([가-힣]+시)/);
  if (siMatch) return siMatch[1];
  
  return '기타';
}

// JavaScript 객체 리터럴을 간단히 파싱
function parseObject(str) {
  try {
    const obj = {};
    
    // id: 숫자
    const idMatch = str.match(/id:\s*(\d+)/);
    if (idMatch) obj.id = parseInt(idMatch[1]);
    
    // lat, lng: 숫자
    const latMatch = str.match(/lat:\s*(-?\d+\.?\d*)/);
    if (latMatch) obj.lat = parseFloat(latMatch[1]);
    
    const lngMatch = str.match(/lng:\s*(-?\d+\.?\d*)/);
    if (lngMatch) obj.lng = parseFloat(lngMatch[1]);
    
    // 문자열 필드: name, keyword, address, hours, pl, menuType, menuLink
    const strFields = ['name', 'keyword', 'address', 'hours', 'pl', 'menuType', 'menuLink', 'menuAppName', 'menuAppNote', 'menuLinkIos', 'menuLinkAndroid'];
    for (const field of strFields) {
      const regex = new RegExp(`${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
      const match = str.match(regex);
      if (match) obj[field] = match[1].replace(/\\"/g, '"');
    }
    
    // price, crowd: 숫자
    const priceMatch = str.match(/price:\s*(\d+)/);
    if (priceMatch) obj.price = parseInt(priceMatch[1]);
    
    const crowdMatch = str.match(/crowd:\s*(\d+)/);
    if (crowdMatch) obj.crowd = parseInt(crowdMatch[1]);
    
    // open, useKeyword: boolean
    const openMatch = str.match(/open:\s*(true|false)/);
    if (openMatch) obj.open = openMatch[1] === 'true';
    
    const useKeywordMatch = str.match(/useKeyword:\s*(true|false)/);
    if (useKeywordMatch) obj.useKeyword = useKeywordMatch[1] === 'true';
    
    return obj;
  } catch (err) {
    return null;
  }
}
