# NEXUS 개발 블로그 이미지 스타일 가이드

NEXUS 개발기 이미지는 아래 스타일을 기본값으로 사용한다.

## 핵심 방향

- 공책 위에 직접 그린 듯한 거친 흑백 펜 낙서
- 일부러 서툰 원형 머리 막대인간과 어색한 원근감
- 검은 볼펜·사인펜 선화와 최소한의 해칭
- 미색 줄 공책, 찢어진 종이 가장자리, 마스킹 테이프, 작은 잉크 얼룩
- 강조색은 NEXUS 보라색 한 가지로 제한
- 완성도 높은 삽화보다 개인 개발 노트 같은 친근함과 건조한 유머
- 이미지 한 장에는 메시지 하나만 담기

기준 이미지:

- `docs/blog/images/nexus-dev-1-foundation/cover-building-nexus.png`
- `docs/blog/images/nexus-dev-1-foundation/organizer-before-after.png`

## 공통 마스터 프롬프트

```text
Use case: illustration-story
Asset type: NEXUS Korean developer blog illustration, wide 16:9 landscape

Input image:
Use the provided NEXUS notebook-doodle image only as a strict visual-style
reference. Create a completely new scene and composition.

Style/medium:
Off-white ruled notebook paper with subtle fibers, torn edges, masking tape,
small ink smudges and eraser marks. Crude original black ballpoint and uneven
felt-tip doodles, awkward round-headed stick figures, shaky imperfect strokes,
inconsistent line weight, deliberately clumsy perspective, sparse
cross-hatching, dry gentle visual humor, and generous white space.

Color:
Black ink plus one restrained Nexus-purple spot color only. Use purple for a
divider, check mark, connection, underline, or one key visual cue.

Composition:
Large simple objects and bold silhouettes. The main idea must be readable at
small thumbnail size. Keep broad outer margins and avoid decorative clutter.

Constraints:
No readable text, letters, numbers, labels, logos, trademarks, recognizable
copyrighted characters, polished professional line art, photorealism, 3D
rendering, pastel clay mascots, anime, gradients, or watermark.
```

## 본문 이미지 구성

본문 설명 이미지는 기본적으로 명확한 2컷 전후 비교를 사용한다.

```text
Scene structure:
An unmistakable two-panel comic separated by one rough vertical purple marker
line.

Left panel:
Show the problem with one exaggerated action, one visibly troubled organizer,
and no more than four large supporting objects.

Right panel:
Show the solution with the same organizer, one calm action, and one clearly
organized system. Add a single purple check mark when useful.

Critical rule:
Communicate only one idea. Do not turn the image into a workflow diagram or
combine several architecture concepts in one scene.
```

좋은 메시지 예시:

- 여러 도구를 오가는 방장 / 하나의 내전 룸에서 처리하는 방장
- 반복 프로필 요청으로 흔들리는 서버 / 한 번 조회해 캐시한 안정된 서버
- 한 로직에 모든 책임이 얽힌 상태 / 웹과 봇이 각자 한 가지 책임을 맡는 상태

## 표지 구성

표지는 내용을 모두 설명하지 않고 글의 주제와 분위기만 전달한다.

```text
Asset type: main cover for a NEXUS Korean developer blog article

Primary request:
Create a simple personal developer-journal scene that evokes the article's
topic without explaining its complete workflow.

Composition:
Place one developer and a few topic-related props in the lower-right third.
Reserve broad clean notebook-paper negative space in the upper-left for a title.
Use no more than five supporting objects.
```

이미지 생성 모델에서 한글 제목이 틀어질 수 있으므로:

- 가능하면 짧은 영문 제목을 사용한다.
- 한글 제목은 이미지 밖의 블로그 UI나 후처리 단계에서 넣는다.
- 생성 결과의 글자는 반드시 육안으로 검수한다.

## 피해야 할 결과

- 한 장에 방 생성, 팀 편성, 역할, 대진표, Discord, WebSocket을 모두 넣기
- 아이콘과 화살표가 많은 인포그래픽
- 귀여운 젤리·클레이 마스코트
- 네온 기반의 무거운 기술 콘셉트 아트
- 너무 반듯하고 잘 그린 상업 삽화
- 의미 없는 UI 창과 읽을 수 없는 가짜 텍스트
- 장면만 보고 핵심 문제와 해결책을 구분할 수 없는 구성

## 생성 순서

1. 글에서 이미지로 전달할 메시지를 한 문장으로 정한다.
2. 표지인지 본문 이미지인지 결정한다.
3. 본문 이미지는 가능하면 문제/해결 2컷으로 바꾼다.
4. 먼저 한 장만 생성해 메시지 전달력을 확인한다.
5. 승인된 이미지를 다음 이미지의 스타일 레퍼런스로 사용한다.
6. 글자, 손가락, 인물 수, 좌우 의미를 육안으로 검수한다.
7. 최종 파일을 `docs/blog/images/<article-slug>/` 아래에 저장한다.

## 파일명 규칙

```text
cover-<short-title>.png
<topic>-before-after.png
<topic>-responsibilities.png
```

이미지 기본 비율은 `16:9`, 현재 기준 해상도는 `1672×941`이다.
