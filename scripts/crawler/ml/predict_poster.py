import argparse
import json
from pathlib import Path

import torch
from torch import nn
from torchvision import models, transforms
from PIL import Image


def parse_args():
    parser = argparse.ArgumentParser(description="Predict poster/not_poster with a trained PosterLink model.")
    parser.add_argument("--model", default="data/ai-models/poster_classifier.pt")
    parser.add_argument("--image", required=True)
    parser.add_argument("--threshold", type=float, default=0.65)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    return parser.parse_args()


def build_model(label_count):
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, label_count)
    return model


def load_image(image_path):
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    image = Image.open(image_path).convert("RGB")
    return transform(image).unsqueeze(0)


def main():
    args = parse_args()
    device = torch.device(args.device)
    checkpoint = torch.load(args.model, map_location=device)
    labels = checkpoint["labels"]
    model = build_model(len(labels)).to(device)
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()

    image = load_image(Path(args.image)).to(device)
    with torch.no_grad():
        logits = model(image)
        probabilities = torch.softmax(logits, dim=1)[0].cpu().tolist()

    scores = dict(zip(labels, probabilities))
    poster_score = float(scores.get("poster", 0.0))
    result = {
        "isPoster": poster_score >= args.threshold,
        "confidence": poster_score,
        "threshold": args.threshold,
        "label": "poster" if poster_score >= args.threshold else "not_poster",
        "scores": scores,
        "model": args.model,
        "image": args.image,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
