# LabPaper 시작 가이드
# 터미널에 순서대로 복붙하세요

# =====================
# STEP 1: 프로젝트 생성
# =====================
npx create-next-app@latest labpaper --typescript --tailwind --app --no-eslint
cd labpaper

# 패키지 설치
npm install @supabase/supabase-js @anthropic-ai/sdk

# =====================
# STEP 2: 파일 복사
# =====================
# 이 레포의 모든 파일을 labpaper/ 폴더에 덮어쓰기

# =====================
# STEP 3: Supabase 설정
# =====================
# 1. https://supabase.com 에서 새 프로젝트 생성 (무료)
# 2. 프로젝트 대시보드 → SQL Editor
# 3. supabase/schema.sql 내용 전체 복사 → 실행
# 4. Settings → API → URL과 anon key 복사

# =====================
# STEP 4: 환경변수 설정
# =====================
# .env.local 파일 생성 후 아래 내용 입력:

cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=여기에_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=여기에_anon_key
SUPABASE_SERVICE_ROLE_KEY=여기에_service_role_key
ANTHROPIC_API_KEY=여기에_anthropic_api_key
CRON_SECRET=아무_랜덤_문자열_예시_labpaper2024
NEXT_PUBLIC_ADMIN_PASSWORD=관리자_비밀번호
EOF

# =====================
# STEP 5: 로컬 실행
# =====================
npm run dev
# http://localhost:3000 에서 확인

# =====================
# STEP 6: Vercel 배포
# =====================
npm i -g vercel
vercel

# 배포 후 Vercel 대시보드 → Settings → Environment Variables 에서
# .env.local의 모든 변수 동일하게 입력

# =====================
# STEP 7: 첫 논문 수집
# =====================
# 배포 후 관리자 페이지(/admin)에서 "지금 수집하기" 클릭
# 또는 터미널에서:
curl -X POST https://your-domain.vercel.app/api/papers/collect \
  -H "Authorization: Bearer 여기에_CRON_SECRET"

# =====================
# 매주 자동 실행
# =====================
# vercel.json에 설정된 cron이 매주 월요일 오전 9시(KST)에 자동 수집합니다.
# Vercel Pro 플랜 필요 (무료는 수동 트리거만 가능)
# 무료로 자동화하려면: GitHub Actions 사용 가능 (요청 시 설정 방법 안내)
