#!/bin/bash

# Riot Tournament API 설정 스크립트
# 사용법: bash scripts/setup-tournament.sh

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Riot Tournament API 설정 시작${NC}\n"

# .env 파일 경로
ENV_FILE=".env"

# .env 파일이 있는지 확인
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ .env 파일을 찾을 수 없습니다.${NC}"
  exit 1
fi

# RIOT_API_KEY 읽기
RIOT_API_KEY=$(grep "^RIOT_API_KEY=" "$ENV_FILE" | cut -d '=' -f2)

if [ -z "$RIOT_API_KEY" ]; then
  echo -e "${RED}❌ RIOT_API_KEY가 .env 파일에 설정되어 있지 않습니다.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ API Key 확인 완료${NC}\n"

# API Base URL
BASE_URL="https://americas.api.riotgames.com"

# 1. Provider 생성
echo -e "${YELLOW}📡 Provider 생성 중...${NC}"

PROVIDER_RESPONSE=$(curl -s -X POST \
  "${BASE_URL}/lol/tournament-stub/v5/providers" \
  -H "X-Riot-Token: ${RIOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "region": "KR",
    "url": "http://localhost:4000/api/webhooks/riot/tournament"
  }')

PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | grep -o '[0-9]*')

if [ -z "$PROVIDER_ID" ]; then
  echo -e "${RED}❌ Provider 생성 실패${NC}"
  echo "Response: $PROVIDER_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Provider 생성 완료: ${PROVIDER_ID}${NC}\n"

# 잠시 대기 (Rate Limit 방지)
sleep 1

# 2. Tournament 생성
echo -e "${YELLOW}📡 Tournament 생성 중...${NC}"

TOURNAMENT_RESPONSE=$(curl -s -X POST \
  "${BASE_URL}/lol/tournament-stub/v5/tournaments" \
  -H "X-Riot-Token: ${RIOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Nexus In-House Tournament\",
    \"providerId\": ${PROVIDER_ID}
  }")

TOURNAMENT_ID=$(echo "$TOURNAMENT_RESPONSE" | grep -o '[0-9]*')

if [ -z "$TOURNAMENT_ID" ]; then
  echo -e "${RED}❌ Tournament 생성 실패${NC}"
  echo "Response: $TOURNAMENT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Tournament 생성 완료: ${TOURNAMENT_ID}${NC}\n"

# 3. .env 파일 업데이트
echo -e "${YELLOW}📝 .env 파일 업데이트 중...${NC}"

# RIOT_TOURNAMENT_PROVIDER_ID 업데이트 또는 추가
if grep -q "^RIOT_TOURNAMENT_PROVIDER_ID=" "$ENV_FILE"; then
  # 기존 값 업데이트 (macOS/Linux 호환)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^RIOT_TOURNAMENT_PROVIDER_ID=.*/RIOT_TOURNAMENT_PROVIDER_ID=${PROVIDER_ID}/" "$ENV_FILE"
  else
    sed -i "s/^RIOT_TOURNAMENT_PROVIDER_ID=.*/RIOT_TOURNAMENT_PROVIDER_ID=${PROVIDER_ID}/" "$ENV_FILE"
  fi
else
  # 새로 추가
  echo "RIOT_TOURNAMENT_PROVIDER_ID=${PROVIDER_ID}" >> "$ENV_FILE"
fi

# RIOT_TOURNAMENT_ID 업데이트 또는 추가
if grep -q "^RIOT_TOURNAMENT_ID=" "$ENV_FILE"; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^RIOT_TOURNAMENT_ID=.*/RIOT_TOURNAMENT_ID=${TOURNAMENT_ID}/" "$ENV_FILE"
  else
    sed -i "s/^RIOT_TOURNAMENT_ID=.*/RIOT_TOURNAMENT_ID=${TOURNAMENT_ID}/" "$ENV_FILE"
  fi
else
  echo "RIOT_TOURNAMENT_ID=${TOURNAMENT_ID}" >> "$ENV_FILE"
fi

echo -e "${GREEN}✅ .env 파일 업데이트 완료${NC}\n"

# 완료
echo -e "${GREEN}🎉 Tournament API 설정 완료!${NC}\n"
echo -e "생성된 ID:"
echo -e "  ${YELLOW}Provider ID:${NC} ${PROVIDER_ID}"
echo -e "  ${YELLOW}Tournament ID:${NC} ${TOURNAMENT_ID}"
echo -e "\n${GREEN}이제 서버를 재시작하면 Tournament Code를 생성할 수 있습니다.${NC}"
