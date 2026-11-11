# 2026-11-11 일일 크롤러 수집 배치의 디스크 부족

브랜치 `fix/crawler-disk-cpu-torch-20261111` (origin/main `8d9d505` 기준)

## 문제

수집 배치 1(`crawl-and-upload (1)`)이 8번 실패했다(9/23~9/27, 10/05, 10/28, 10/31). 실패 단계는 Python 의존성 설치이고, 오류는 다음과 같다.

```text
ERROR: Could not install packages due to an OSError: [Errno 28] No space left on device
```

게이트까지 가지 못해서 그날 실행 전체가 실패했다.

## 원인 (#219, 10/31 로그)

`pip install -r ml/requirements.txt`가 디스크를 채웠다. requirements의 내용은 다음과 같다.

- `torch>=2.2`, `torchvision>=0.17`, `pillow`, `open-clip-torch`
- 버전을 고정하지 않았다.

| 무엇이 커지나 | 크기 |
|---|---|
| 캐시 `clip-deps-Linux-…` 복원(`~/.cache/pip`, `~/.cache/huggingface`, `~/.cache/clip`) | 2,580MB |
| PyPI 기본 torch(CUDA판)와 NVIDIA 휠 다운로드 | 3,039MB |
| 위 휠을 푼 설치 파일(site-packages) | 휠보다 큼. 정확한 값은 로그에 없음 |

다운로드한 큰 휠은 다음과 같다.

- `torch-2.15.0` 539MB
- `nvidia_cudnn_cu13` 519MB
- `nvidia_cublas` 405MB
- `triton` 286MB
- `nvidia_cusolver` 228MB
- `nvidia_cufft` 218MB
- `nvidia_nccl_cu13` 216MB
- `nvidia_cusparselt_cu13` 170MB
- `nvidia_cusparse` 151MB
- `nvidia_nvshmem_cu13` 135MB

### 이렇게 된 이유

- **CUDA판 설치:** 러너에는 GPU가 없다. 그래도 PyPI 기본 torch는 CUDA판이라 NVIDIA 라이브러리를 모두 받는다. CLIP 스크립트(`clip_classify.py`, `predict_poster.py`)는 CUDA가 없으면 CPU로 동작한다.
- **쓰지 않는 pip 캐시:**
  - 캐시 키는 requirements 파일의 해시라서, 파일이 바뀌지 않는 한 같은 키를 계속 맞힌다. 처음 저장한 오래된 휠 2.6GB가 매번 복원되고, 다시 저장되지도 않는다.
  - requirements는 버전을 고정하지 않아 pip가 매번 최신 버전을 새로 받는다. 그래서 복원한 휠은 쓰이지 않고 디스크만 차지한다.
- **배치 1에서만 실패한 이유:** 네 배치 모두 같은 설치를 한다. 러너마다 남은 공간이 달라서 넘친 날 배치 1에서 실패한 것으로 본다. 러너의 남은 공간은 로그에 없었다. 이번 변경으로 설치 전후 `df`를 남긴다.

## 변경 (`.github/workflows/crawler.yml`, 수집 배치만)

- **설치:** CPU판 torch와 torchvision을 먼저 설치한다(`--index-url https://download.pytorch.org/whl/cpu`, torch 2.15.0+cpu 약 200MB). 그다음 requirements를 설치하면 이미 설치된 CPU판을 그대로 쓴다.
  - 두 단계 모두 `--no-cache-dir`로 설치한다.
  - 설치 뒤 `torch`, `open_clip` import와 CUDA 사용 여부(`False`가 정상)를 출력한다.
- **캐시:** pip 캐시를 뺐다. 모델 가중치(`~/.cache/huggingface`, `~/.cache/clip`)만 새 키 `clip-models-v2-…`로 저장한다.
  - 첫 실행은 캐시 미스여서 CLIP 가중치를 한 번 새로 받는다.
  - 기존 2.6GB 캐시는 7일 동안 접근이 없으면 GitHub이 지운다. 그 전에 지우려면 Actions 캐시 화면에서 직접 지울 수 있다.
- **디스크 기록:** 설치 전후 `df -h /`를 로그에 남긴다.
- `scripts/crawler/ml/README.md`: GPU가 없는 환경의 설치 방법을 적었다.

### 줄어드는 양(추정)

- 다운로드: 3,039MB → 약 230MB(torch CPU 200MB와 나머지 순수 Python 휠)
- 복원하는 캐시: 2,580MB → 모델 가중치만

## 검증

- 러너와 같은 조건(Linux x86_64, Python 3.12)으로 pip 의존성 해석을 실행했다(`pip install --dry-run --report`, 큰 파일은 받지 않음).
  - torch는 `2.15.0+cpu`, torchvision은 `0.29.2+cpu`로 해석된다.
  - NVIDIA 패키지와 triton은 설치 목록에 없다.
- 실제 러너에서는 아직 돌려 보지 않았다.
  - 이 워크플로를 브랜치에서 수동 실행하면 운영 DB에 수집 결과를 올린다. 같은 그룹의 실행도 취소한다(`concurrency: crawler-all`, `cancel-in-progress`).
  - 그래서 병합 뒤 첫 예약 실행의 로그로 확인한다. 확인할 항목:
    - `torch … cuda False`
    - 설치 뒤 `df`
    - CLIP 분류 단계 오류 없음
- `git diff --check` 통과.

## 영향과 롤백

- 운영 데이터 변경은 없다. 워크플로의 의존성 설치 방식만 바뀐다.
- CLIP 분류는 원래도 CPU에서 돌았다. CUDA가 없어 CPU로 떨어졌기 때문이다. 결과와 속도는 같아야 한다.
- 되돌리기: 이 PR을 revert한다.
