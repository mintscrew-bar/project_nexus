# 이미지 파일 위치

이 폴더에 다음 이미지 파일들을 추가해주세요:

## 넥서스 로고
- **파일명**: `nexus-logo.png`
- **위치**: `public/images/nexus-logo.png`
- **용도**: 헤더, 홈페이지, 파비콘 등
- **권장 크기**: 최소 512x512px (SVG 권장)

## 로고 디자인 특징
- 파편화된 "N" 글자
- 블루-퍼플 그라데이션 배경 (원형)
- 마젠타/네온 핑크 아웃라인
- 3D 입체감 효과

## 사용 방법
로고는 `Logo` 컴포넌트를 통해 사용됩니다:
```tsx
import { Logo } from "@/components/Logo";

<Logo size="xl" />
```
