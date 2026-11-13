// GitHub에 식당 추가/수정/삭제 (단건 + 일괄)
export default async function handler(req, res) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'yeouidoeat/cafeteria-map';
  const FILE_PATH = 'index.html';
  
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN 미설정' });
  }

  // 작업 타입 판별
  const { single, bulk, action, update, deleteIds } = req.body;
  const op = action || 'add';
  
  try {
    // 1. 현재 index.html 가져오기
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
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

    // 2. 배열 위치 찾기
    const { arrayStart, arrayEnd, nextId } = findArrayPositions(currentContent);
    if (arrayStart === -1) {
      return res.status(500).json({ error: 'cafeterias 배열을 찾을 수 없음' });
    }

    let newFileContent = currentContent;
    let commitMessage = '';

    if (op === 'update' && update) {
      // 수정: 특정 id의 객체를 새 객체로 교체
      const result = updateCafeteria(currentContent, update);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      newFileContent = result.content;
      commitMessage = `Update cafeteria id:${update.id} (${update.name})`;
      
    } else if (op === 'bulkUpdate' && req.body.bulkUpdate && Array.isArray(req.body.bulkUpdate)) {
      // 일괄 수정: 여러 식당을 한 번의 커밋으로
      const updates = req.body.bulkUpdate;
      let updatedContent = currentContent;
      const succeeded = [];
      const failed = [];
      
      for (const upd of updates) {
        const result = updateCafeteria(updatedContent, upd);
        if (result.success) {
          updatedContent = result.content;
          succeeded.push(upd.id);
        } else {
          failed.push({ id: upd.id, error: result.error });
        }
      }
      
      if (succeeded.length === 0) {
        return res.status(500).json({ error: '모두 수정 실패', failed });
      }
      
      newFileContent = updatedContent;
      commitMessage = succeeded.length === 1
        ? `Update cafeteria id:${succeeded[0]}`
        : `Update ${succeeded.length} cafeterias (bulk)`;
      
    } else if (op === 'delete' && deleteIds && Array.isArray(deleteIds)) {
      // 삭제: 여러 id의 객체들 제거
      const result = deleteCafeterias(currentContent, deleteIds);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      newFileContent = result.content;
      commitMessage = deleteIds.length === 1
        ? `Delete cafeteria id:${deleteIds[0]}`
        : `Delete ${deleteIds.length} cafeterias`;
      
    } else {
      // 추가 (기본)
      let cafeterias = [];
      if (bulk && Array.isArray(bulk)) {
        cafeterias = bulk;
      } else if (single) {
        cafeterias = [single];
      } else {
        cafeterias = [req.body];
      }
      
      if (cafeterias.length === 0) {
        return res.status(400).json({ error: '등록할 식당 없음' });
      }

      const newEntries = cafeterias.map((cafe, idx) => {
        return formatCafeteriaEntry(nextId + idx, cafe);
      }).join(',\n');

      // 배열 끝에 추가
      const beforeEnd = currentContent.substring(0, arrayEnd);
      const lastChar = beforeEnd.trimEnd().slice(-1);
      const needsComma = lastChar !== ',' && lastChar !== '[';
      const insertion = (needsComma ? ',\n' : '\n') + newEntries + '\n';
      
      newFileContent = 
        currentContent.substring(0, arrayEnd) + 
        insertion +
        currentContent.substring(arrayEnd);
      
      commitMessage = cafeterias.length === 1 
        ? `Add cafeteria: ${cafeterias[0].name}`
        : `Add ${cafeterias.length} cafeterias (bulk)`;
    }

    // 3. GitHub에 커밋
    const updateRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: Buffer.from(newFileContent, 'utf-8').toString('base64'),
          sha: fileData.sha
        })
      }
    );

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      return res.status(500).json({ error: 'GitHub 커밋 실패: ' + errData.message });
    }

    const result = await updateRes.json();
    return res.status(200).json({ 
      success: true, 
      operation: op,
      commit: result.commit?.sha || ''
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// 배열 위치 찾기
function findArrayPositions(content) {
  const arrayMatch = content.match(/const cafeterias = \[/);
  if (!arrayMatch) return { arrayStart: -1, arrayEnd: -1, nextId: 1 };
  
  const arrayStart = arrayMatch.index;
  let bracketCount = 0;
  let arrayEnd = -1;
  let inString = false;
  let stringChar = null;
  let i = arrayStart + 'const cafeterias = '.length;
  
  for (; i < content.length; i++) {
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
  
  // 다음 id 계산
  const arrayContent = content.substring(arrayStart, arrayEnd);
  const idMatches = arrayContent.match(/id:\s*(\d+)/g);
  let nextId = 1;
  if (idMatches) {
    const ids = idMatches.map(m => parseInt(m.match(/\d+/)[0]));
    nextId = Math.max(...ids) + 1;
  }
  
  return { arrayStart, arrayEnd, nextId };
}

// 식당 하나 포맷팅
function formatCafeteriaEntry(id, cafe) {
  const name = (cafe.name || '').replace(/"/g, '\\"');
  const address = (cafe.address || '').replace(/"/g, '\\"');
  const hours = (cafe.hours || '').replace(/"/g, '\\"');
  const keyword = (cafe.keyword || cafe.name || '').replace(/"/g, '\\"');
  const price = parseInt(cafe.price) || 0;
  const priceDisplay = cafe.pl || (price > 0 ? price.toLocaleString() + '원' : '');
  const menuType = cafe.menu_type || cafe.menuType || 'none';
  const menuLink = cafe.menu_url || cafe.menuLink || '';
  const crowd = cafe.crowd !== undefined ? cafe.crowd : 50;
  const open = cafe.open !== undefined ? cafe.open : true;
  
  // 좌표가 있는 경우 (숫자이고 0이 아닌 경우)
  const hasLat = cafe.lat !== undefined && cafe.lat !== null && cafe.lat !== 0;
  const hasLng = cafe.lng !== undefined && cafe.lng !== null && cafe.lng !== 0;
  
  let entry = `  { id:${id}`;
  
  if (hasLat && hasLng) {
    entry += `, lat:${cafe.lat}, lng:${cafe.lng}`;
  }
  
  entry += `, keyword:"${keyword}", name:"${name}", price:${price}, pl:"${priceDisplay}", crowd:${crowd}, open:${open}, hours:"${hours}", address:"${address}"`;
  
  if (menuType && menuType !== 'none' && menuLink) {
    entry += `, menuType:"${menuType}", menuLink:"${menuLink.replace(/"/g, '\\"')}"`;
  }
  
  entry += ` }`;
  return entry;
}

// 식당 수정
function updateCafeteria(content, updateData) {
  const id = updateData.id;
  if (!id) return { success: false, error: 'id 필요' };
  
  // id로 해당 객체 찾기
  // { id:XXX, ... }  패턴으로 전체 객체 범위 찾기
  const idPattern = new RegExp(`\\{\\s*id:\\s*${id}\\b`);
  const match = content.match(idPattern);
  if (!match) {
    return { success: false, error: `id:${id} 식당을 찾을 수 없음` };
  }
  
  const objStart = match.index;
  
  // 객체 끝 찾기 (중첩 괄호 고려)
  let depth = 0;
  let objEnd = -1;
  let inStr = false;
  let strCh = null;
  
  for (let i = objStart; i < content.length; i++) {
    const ch = content[i];
    const prevCh = i > 0 ? content[i-1] : '';
    
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
    
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        objEnd = i + 1;
        break;
      }
    }
  }
  
  if (objEnd === -1) {
    return { success: false, error: '객체 끝을 찾을 수 없음' };
  }
  
  // 새 객체로 교체
  const newEntry = formatCafeteriaEntry(id, updateData);
  // 들여쓰기 유지 (" "두 개로 시작하는 경우가 많음)
  const newContent = content.substring(0, objStart) + newEntry.trimStart() + content.substring(objEnd);
  
  return { success: true, content: newContent };
}

// 식당 삭제 (여러 개)
function deleteCafeterias(content, ids) {
  let newContent = content;
  const removed = [];
  const notFound = [];
  
  for (const id of ids) {
    const idPattern = new RegExp(`\\{\\s*id:\\s*${id}\\b`);
    const match = newContent.match(idPattern);
    if (!match) {
      notFound.push(id);
      continue;
    }
    
    const objStart = match.index;
    let depth = 0;
    let objEnd = -1;
    let inStr = false;
    let strCh = null;
    
    for (let i = objStart; i < newContent.length; i++) {
      const ch = newContent[i];
      const prevCh = i > 0 ? newContent[i-1] : '';
      
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
      
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          objEnd = i + 1;
          break;
        }
      }
    }
    
    if (objEnd === -1) continue;
    
    // 객체 삭제 + 앞뒤 쉼표/공백 정리
    let deleteStart = objStart;
    let deleteEnd = objEnd;
    
    // 뒤쪽 쉼표 포함 삭제
    while (deleteEnd < newContent.length && (newContent[deleteEnd] === ',' || newContent[deleteEnd] === ' ' || newContent[deleteEnd] === '\n')) {
      deleteEnd++;
      if (newContent[deleteEnd - 1] === '\n') break;
    }
    
    // 앞쪽 공백 정리 (줄 전체 삭제)
    while (deleteStart > 0 && (newContent[deleteStart - 1] === ' ' || newContent[deleteStart - 1] === '\t')) {
      deleteStart--;
    }
    
    newContent = newContent.substring(0, deleteStart) + newContent.substring(deleteEnd);
    removed.push(id);
  }
  
  if (removed.length === 0) {
    return { success: false, error: `삭제할 식당을 찾을 수 없음: ${ids.join(', ')}` };
  }
  
  return { success: true, content: newContent, removed, notFound };
}
