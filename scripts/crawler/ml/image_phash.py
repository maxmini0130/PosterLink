import argparse
import json

from PIL import Image

# SNS_INGESTION.md Phase 3 후속 — notice_sightings.image_phash 계산.
# 여러 출처(게시판/블로그)에 같은 포스터 이미지가 서로 다른 URL로 올라왔을 때
# 텍스트/URL 기반 중복판정을 시각적으로 보강하기 위한 지각적 해시(average hash).
# 외부 라이브러리(imagehash) 없이 Pillow만으로 64비트 average hash를 계산한다:
# 8x8로 축소 후 그레이스케일 평균과 비교해 비트열을 만든다.

HASH_SIZE = 8


def compute_average_hash(image: Image.Image) -> str:
    grayscale = image.convert("L").resize((HASH_SIZE, HASH_SIZE), Image.LANCZOS)
    pixels = list(grayscale.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel > average else "0" for pixel in pixels)
    return format(int(bits, 2), "016x")


def parse_args():
    parser = argparse.ArgumentParser(description="Compute a 64-bit average hash + dimensions for an image file.")
    parser.add_argument("--image", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    with Image.open(args.image) as image:
        width, height = image.size
        phash = compute_average_hash(image)

    print(json.dumps({"phash": phash, "width": width, "height": height}, ensure_ascii=False))


if __name__ == "__main__":
    main()
