# DANZZAC · 수요 레이더

한국 상품 구매·배송대행 수요를 찾는 한국어 대시보드입니다. GitHub Pages + GitHub Actions + Brave Search API로 구성하며 Python 표준 라이브러리만 사용합니다.

## 시작하기

1. GitHub 저장소의 **main** 브랜치에 이 폴더의 파일을 업로드합니다. `.github/workflows/monitor.yml`도 포함해야 합니다.
2. 저장소 **Settings → Pages → Source → GitHub Actions**를 선택합니다.
3. **Settings → Secrets and variables → Actions → Secrets**에 `BRAVE_SEARCH_API_KEY`를 등록합니다.
4. 검색 결과 저장을 명시적으로 허용하는 Brave API 계약/플랜을 사용하고, 같은 화면 **Variables**에 `SEARCH_STORAGE_ALLOWED`를 `true`로 등록합니다. 일반 검색 플랜은 결과 저장 권한이 없을 수 있습니다. https://brave.com/search/api/
5. **Settings → Actions → General → Workflow permissions**에서 읽기/쓰기를 허용합니다. main 브랜치 보호가 봇 커밋을 차단한다면 별도 데이터 브랜치 운영 등 조정이 필요합니다.
6. **Actions → Collect and publish → Run workflow**를 실행합니다. 끝나면 Pages 주소에서 실제 결과를 확인합니다.

실제 검색 연결 전에는 빈 상태를 표시합니다. 가짜 게시글이나 가짜 수집 시간은 없습니다. 키를 등록하지 않아도 페이지는 배포되며 연결 대기로 표시됩니다. 검색 키를 프런트엔드나 저장소 파일에 넣지 마세요.

## 웹에서 검색어 변경

검색 설정에서 검색어, 제외 표현, 채널, 기간, 최소 관련도를 변경합니다. 해당 저장소만 지정한 fine-grained GitHub 토큰(Contents 쓰기; 워크플로 실행 관리 시 Actions 쓰기)을 입력하면 `config.json`을 main에 커밋하고 push 워크플로가 수집합니다. 토큰은 브라우저 메모리에만 있으며 저장 후 입력값을 지웁니다. 공개 페이지의 다른 방문자는 토큰 없이 설정을 변경할 수 없습니다. GitHub Pages에는 로그인 장벽이 없으므로 검색어와 수집 결과는 공개됩니다.

토큰을 사용하지 않으려면 설정 파일을 내려받아 저장소 루트의 `config.json`을 교체하세요. 새 채널은 해당 파일의 `sources`에 이름과 도메인/경로를 추가하면 웹에 나타납니다. UI 새로고침은 배포된 결과를 다시 읽습니다. 즉시 수집은 Actions의 Run workflow를 사용합니다.

## 검색 대상과 판별

- Reddit: r/kpophelp, r/kpopcollections, r/AsianBeauty. 굿즈·포토카드·한국 화장품 구매 및 배송 질문을 찾습니다.
- Quora / X: 공개 검색 색인에 있는 질문만 탐색합니다. API를 통한 전체 스트림 모니터링이 아닙니다.
- HeyKorean / MissyUSA / 고우해커스: 교포·유학생의 한국 물건 구매 수요 탐색 후보입니다. 게시판의 색인 여부에 따라 결과가 없을 수 있습니다.

각 검색어 × 활성 채널을 검색합니다. 기본 6 × 8 = 실행당 48회(하루 최대 96회), 검색당 최대 20개 결과이며 중복 URL을 통합합니다. 검색량이 설정 한도를 넘으면 다음 실행에서 남은 조합부터 순환합니다. API 요금은 사용 중인 플랜을 확인하세요.

한국 연관성 25점, 배송/구매대행 맥락 30점, 질문/추천 요청 25점, 구매/배송 표현 20점의 규칙 기반 점수입니다. 제목과 검색 요약만으로 판단하므로 실제 구매 의도를 보장하지 않습니다. 제외 표현이 있으면 제외합니다. 영문·한국어를 우선 지원하며 다른 언어는 검색어 및 점수 사전 확장이 필요합니다.

원문 전체, 작성자 개인정보, 댓글은 수집하지 않습니다. 원문 사이트를 직접 크롤링하지 않으며 차단 우회도 하지 않습니다. Reddit 직접 API 수집은 별도 승인이 필요합니다. 검색 결과만으로 모든 게시글이나 정확한 게시/수정 시각을 알 수 없습니다. 검색엔진 날짜가 없으면 확인 불가로 표시하고 최초/최근 발견 시각을 따로 기록합니다. 수집된 URL은 게시글 후보로, 일반 안내 페이지가 섞일 수 있습니다. 관련도와 원문 확인을 함께 사용하세요.

최근 90일 내 발견한 결과를 보관합니다. 검색어를 변경해도 기존 결과는 보관 기간 동안 남습니다. 공개 Git 저장소의 과거 커밋에는 이전 데이터가 남을 수 있습니다. 원문 삭제와 자동 동기화하지 않습니다.

## 운영

- 매일 한국 시간 09:17 / 21:17 예약(UTC 00:17 / 12:17). GitHub 예약 실행은 지연될 수 있습니다.
- 공개 저장소는 60일간 저장소 활동이 없으면 예약이 비활성화될 수 있습니다. 데이터 커밋이 보통 활동을 만들지만 자동화 상태를 정기적으로 확인하세요.
- 일부 API 요청 실패 시 성공 결과를 반영하고 실패 상태를 표시합니다. 전체 실패 시 기존 결과를 유지합니다. 마지막 성공이 26시간 전이면 화면에 경고합니다.
- 429 및 일시적인 서버 오류는 최대 3회 시도합니다. 오류에 API 키를 기록하지 않습니다.
- API 결과를 저장할 수 있는 권한과 외부 게시글 사용 범위는 운영자가 확인해야 합니다. 검색 서비스의 저장 권한은 원문 콘텐츠에 대한 권리를 부여하지 않습니다.
- 자동 댓글·DM 발송 기능은 없습니다.

## 로컬 확인

```powershell
Copy-Item config.json site/data/config.json
python -m unittest discover -s tests -v
python -m http.server 8000 --directory site
```

http://localhost:8000 에서 확인합니다. 파일을 직접 여는 file:// 방식은 fetch가 동작하지 않습니다. `python scripts/collect.py`는 환경 변수의 API 키로 실제 검색합니다.

## 참고

- Brave 검색 API: https://api-dashboard.search.brave.com/app/documentation/web-search
- 저장 권한: https://brave.com/search/api/
- GitHub 예약 실행: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Reddit 접근 정책: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
