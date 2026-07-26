import argparse
import json

import torch
from PIL import Image

import open_clip

# SNS_INGESTION.md Phase 2, Stage 2 — CLIP 시각 선별.
# GPT Vision(poster-image-classifier.js)에 넘기기 전에, 로컬 zero-shot CLIP으로
# "포스터/공고문 레이아웃"인지 "행사사진/로고/카드뉴스"인지 값싸게(비용 0원) 1차 선별한다.
# 여기서 확실히 아니라고 판단된 이미지만 GPT Vision 호출을 건너뛴다(포스터 오탈락 방지를 위해
# 애매하면 항상 GPT Vision으로 넘긴다 — isPosterLayout=True 로 반환).

LABELS = [
    "a poster or flyer with printed announcement text, dates, and program details, designed for a public notice",
    "a photograph of people at a real-world event or ceremony",
    "a logo, icon, emblem, or organizational symbol image",
    "a screenshot of a website, app, or document interface",
    "a chart, table, infographic, or card-news graphic",
]

POSTER_LABEL_INDEX = 0


def parse_args():
    parser = argparse.ArgumentParser(description="Zero-shot CLIP triage: poster-layout vs other visual types.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--model-name", default="ViT-B-32")
    parser.add_argument("--pretrained", default="openai")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    return parser.parse_args()


def main():
    args = parse_args()
    device = torch.device(args.device)

    model, _, preprocess = open_clip.create_model_and_transforms(args.model_name, pretrained=args.pretrained)
    tokenizer = open_clip.get_tokenizer(args.model_name)
    model = model.to(device).eval()

    image = preprocess(Image.open(args.image).convert("RGB")).unsqueeze(0).to(device)
    text = tokenizer(LABELS).to(device)

    with torch.no_grad():
        image_features = model.encode_image(image)
        text_features = model.encode_text(text)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        text_features /= text_features.norm(dim=-1, keepdim=True)
        probabilities = (100.0 * image_features @ text_features.T).softmax(dim=-1)[0].cpu().tolist()

    scores = dict(zip(LABELS, probabilities))
    poster_score = float(probabilities[POSTER_LABEL_INDEX])
    best_index = max(range(len(probabilities)), key=lambda i: probabilities[i])

    result = {
        "isPosterLayout": poster_score >= args.threshold,
        "confidence": poster_score,
        "threshold": args.threshold,
        "bestLabel": LABELS[best_index],
        "scores": scores,
        "model": f"{args.model_name}/{args.pretrained}",
        "image": args.image,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
