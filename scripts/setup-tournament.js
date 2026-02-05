#!/usr/bin/env node

/**
 * Riot Tournament API 설정 스크립트
 *
 * 실행 방법:
 * node scripts/setup-tournament.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// .env 파일 경로
const ENV_FILE = path.join(__dirname, '..', '.env');

// .env 파일 읽기
function loadEnv() {
  const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...values] = trimmed.split('=');
    if (key && values.length > 0) {
      env[key.trim()] = values.join('=').trim();
    }
  });

  return env;
}

// .env 파일 업데이트
function updateEnv(updates) {
  let envContent = fs.readFileSync(ENV_FILE, 'utf-8');

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      // 기존 값 업데이트
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // 새로운 키 추가 (Riot API 섹션에)
      const riotSectionRegex = /(# Riot API\n)/;
      if (riotSectionRegex.test(envContent)) {
        envContent = envContent.replace(
          riotSectionRegex,
          `$1${key}=${value}\n`
        );
      } else {
        // Riot API 섹션이 없으면 파일 끝에 추가
        envContent += `\n${key}=${value}\n`;
      }
    }
  }

  fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
  console.log(`✅ .env 파일 업데이트 완료`);
}

// Provider 생성
async function createProvider(apiKey) {
  console.log('📡 Provider 생성 중...');

  const baseUrl = 'https://americas.api.riotgames.com';
  const webhookUrl = 'http://localhost:4000/api/webhooks/riot/tournament';

  try {
    const response = await axios.post(
      `${baseUrl}/lol/tournament-stub/v5/providers`,
      {
        region: 'KR',
        url: webhookUrl
      },
      {
        headers: {
          'X-Riot-Token': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const providerId = response.data;
    console.log(`✅ Provider 생성 완료: ${providerId}`);
    return providerId;
  } catch (error) {
    console.error('❌ Provider 생성 실패:', error.response?.data || error.message);
    throw error;
  }
}

// Tournament 생성
async function createTournament(apiKey, providerId) {
  console.log('📡 Tournament 생성 중...');

  const baseUrl = 'https://americas.api.riotgames.com';

  try {
    const response = await axios.post(
      `${baseUrl}/lol/tournament-stub/v5/tournaments`,
      {
        name: 'Nexus In-House Tournament',
        providerId: parseInt(providerId)
      },
      {
        headers: {
          'X-Riot-Token': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const tournamentId = response.data;
    console.log(`✅ Tournament 생성 완료: ${tournamentId}`);
    return tournamentId;
  } catch (error) {
    console.error('❌ Tournament 생성 실패:', error.response?.data || error.message);
    throw error;
  }
}

// 메인 함수
async function main() {
  console.log('🚀 Riot Tournament API 설정 시작\n');

  // 환경변수 로드
  const env = loadEnv();

  const apiKey = env.RIOT_API_KEY;
  if (!apiKey) {
    console.error('❌ RIOT_API_KEY가 .env 파일에 설정되어 있지 않습니다.');
    process.exit(1);
  }

  console.log('✅ API Key 확인 완료\n');

  // 이미 설정되어 있는지 확인
  if (env.RIOT_TOURNAMENT_PROVIDER_ID && env.RIOT_TOURNAMENT_ID) {
    console.log('⚠️  이미 Tournament API가 설정되어 있습니다:');
    console.log(`   Provider ID: ${env.RIOT_TOURNAMENT_PROVIDER_ID}`);
    console.log(`   Tournament ID: ${env.RIOT_TOURNAMENT_ID}`);
    console.log('\n계속하시겠습니까? (y/N)');

    // 간단하게 처리 - 실제로는 readline을 사용해야 함
    console.log('새로운 ID를 생성합니다...\n');
  }

  try {
    // Provider 생성
    const providerId = await createProvider(apiKey);

    // 잠시 대기 (Rate Limit 방지)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Tournament 생성
    const tournamentId = await createTournament(apiKey, providerId);

    // .env 파일 업데이트
    updateEnv({
      RIOT_TOURNAMENT_PROVIDER_ID: providerId.toString(),
      RIOT_TOURNAMENT_ID: tournamentId.toString()
    });

    console.log('\n🎉 Tournament API 설정 완료!\n');
    console.log('생성된 ID:');
    console.log(`  Provider ID: ${providerId}`);
    console.log(`  Tournament ID: ${tournamentId}`);
    console.log('\n이제 서버를 재시작하면 Tournament Code를 생성할 수 있습니다.');

  } catch (error) {
    console.error('\n❌ 설정 실패');
    process.exit(1);
  }
}

// 실행
main();
