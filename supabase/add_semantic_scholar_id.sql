-- followed_authors에 Semantic Scholar author ID 컬럼 추가
--
-- 배경: 기존에는 매 수집마다 저자 "이름"으로 S2를 검색해서 첫 번째 결과(data[0])를
-- 무조건 썼다. 동명이인이나 이니셜 표기("C. Yavuz" vs "Cafer T. Yavuz")가 섞이면
-- 엉뚱한 사람의 논문을 가져오거나 0편이 된다.
-- ID를 저장해두면 검색 단계를 건너뛰고 정확한 저자를 바로 조회한다.
--
-- 주의: 아래 scholar_id 컬럼이 이미 있으나 코드에서 쓰이지 않고 있어
-- (Google Scholar용으로 추정) 혼동을 피하려 별도 컬럼을 만든다.

alter table followed_authors add column if not exists semantic_scholar_id text;

comment on column followed_authors.semantic_scholar_id is
  'Semantic Scholar author ID (숫자 문자열). semanticscholar.org/author/<이름>/<ID>의 ID 부분. 비어있으면 이름으로 검색.';

-- ── 검증된 ID 등록 ──────────────────────────────────────────────────────────
-- Cafer T. Yavuz (KAIST)
--
-- ⚠ 참고: 처음 전달받은 ID는 1741438이었으나, S2 API로 확인한 결과 이 ID는
-- 다른 연구자(C. Buckley, 위생/보건 분야, 최신 논문 2023년)를 가리킨다.
--   GET /author/1741438 → {"name": "C. Buckley", "paperCount": 190}
-- 실제 Yavuz 교수는 3556847이며, 논문 목록이 연구 분야와 일치한다.
--   GET /author/3556847 → {"name": "C. Yavuz", "paperCount": 222}
--   최신 논문: COF for Electrochemical Water Splitting, Micropollutant
--             elimination by microporous polymers (2026) 등
-- 1741438로 되돌리려면 아래 값을 바꾸거나 admin 페이지에서 수정하면 된다.
update followed_authors
   set semantic_scholar_id = '3556847'
 where name = 'Cafer T. Yavuz';

-- 저장된 ID 확인용
-- select name, semantic_scholar_id from followed_authors
--  where semantic_scholar_id is not null order by name;
