# LabPaper — 주간 논문 뉴스레터 앱

## 프로젝트 개요
연구실 학생들과 논문을 공유하는 주간 뉴스레터 웹앱.
매주 월요일 자동으로 타겟 저널 & 팔로우 저자의 신규 논문을 수집해서 보여준다.

## 기술 스택
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Realtime)
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude API (논문 요약, 운세 생성)
- **논문 수집**: Semantic Scholar API + Crossref API (무료, 키 불필요)
- **배포**: Vercel (무료)

## 핵심 기능
1. 매주 월요일 논문 자동 수집 (cron job)
2. 논문 카드: 저널 배지 + 대표 그림 + 핵심 결과 bullet 3개 + 관련 논문
3. 반응 시스템: 별점(1-5) + 반응 버튼 4종 — 완전 익명
4. 익명 과학자 이름: 세션마다 랜덤 배정 (localStorage에 저장)
5. 주간 연구실 운세: Claude API로 매주 자동 생성
6. 월간/연간 베스트 논문
7. 학생 저자 제안 → 교수님 승인

## 페이지 구조
- `/` — 이번 주 뉴스레터
- `/archive` — 지난 호 목록
- `/archive/[issue]` — 특정 호 보기
- `/best` — 월간/연간 베스트
- `/suggest` — 저자 제안 (익명)
- `/admin` — 관리자 (논문 수동 추가, 저자 승인, 논문 수집 트리거)

## 환경변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
CRON_SECRET=any_random_string_you_choose
ADMIN_PASSWORD=your_admin_password
```

## 설치 및 실행
```bash
npx create-next-app@latest labpaper --typescript --tailwind --app
cd labpaper
npm install @supabase/supabase-js @anthropic-ai/sdk
# .env.local 파일 만들고 환경변수 입력
npm run dev
```

## Supabase 초기 설정
Supabase 대시보드 → SQL Editor에서 supabase/schema.sql 실행

## 배포
```bash
# Vercel CLI
npm i -g vercel
vercel
# 환경변수는 Vercel 대시보드에서 설정
```

## 코드 컨벤션
- TypeScript 사용
- 서버 컴포넌트 우선, 클라이언트는 'use client' 명시
- API route는 app/api/ 하위
- DB 쿼리는 lib/supabase.ts 통해서
- 컴포넌트는 components/ 하위
