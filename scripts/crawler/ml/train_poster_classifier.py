import argparse
import json
import random
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, models, transforms


LABELS = ["not_poster", "poster"]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".ppm", ".bmp", ".pgm", ".tif", ".tiff", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description="Train PosterLink poster/not_poster image classifier.")
    parser.add_argument("--data", default="data/ai-poster-dataset", help="Dataset root with poster/ and not_poster/ folders.")
    parser.add_argument("--output", default="data/ai-models/poster_classifier.pt", help="Output .pt model path.")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    return parser.parse_args()


def build_transforms():
    train_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(224, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(p=0.2),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train_transform, eval_transform


def build_model():
    weights = models.MobileNet_V3_Small_Weights.DEFAULT
    model = models.mobilenet_v3_small(weights=weights)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, len(LABELS))
    return model


def class_counts(dataset):
    counts = {label: 0 for label in LABELS}
    for _, class_index in dataset.samples:
        counts[dataset.classes[class_index]] += 1
    return counts


def count_images_by_label(data_dir):
    counts = {}
    for label in LABELS:
        label_dir = data_dir / label
        if not label_dir.exists():
            counts[label] = None
            continue
        counts[label] = sum(
            1
            for path in label_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        )
    return counts


def accuracy(model, loader, device):
    model.eval()
    correct = 0
    total = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss_sum += loss.item() * labels.size(0)
            predictions = outputs.argmax(dim=1)
            correct += (predictions == labels).sum().item()
            total += labels.size(0)
    return {
        "loss": loss_sum / max(total, 1),
        "accuracy": correct / max(total, 1),
        "total": total,
    }


def main():
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)

    data_dir = Path(args.data)
    output_path = Path(args.output)
    train_transform, eval_transform = build_transforms()

    image_counts = count_images_by_label(data_dir)
    missing_dirs = [label for label, count in image_counts.items() if count is None]
    if missing_dirs:
        raise SystemExit(
            f"Expected dataset folders {LABELS}, missing {missing_dirs}. "
            "Create both poster/ and not_poster/ folders before training."
        )

    empty_labels = [label for label, count in image_counts.items() if count == 0]
    if empty_labels:
        raise SystemExit(
            f"Need labeled images in both classes before training. Empty classes: {empty_labels}. "
            "Put real poster images in poster/ and non-poster examples in not_poster/."
        )

    full_dataset = datasets.ImageFolder(data_dir, transform=train_transform)
    if full_dataset.classes != LABELS:
        raise SystemExit(f"Expected dataset folders {LABELS}, got {full_dataset.classes}")

    if len(full_dataset) < 20:
        raise SystemExit("Need at least 20 labeled images to start a useful training run.")

    val_size = max(1, int(len(full_dataset) * args.val_ratio))
    train_size = len(full_dataset) - val_size
    generator = torch.Generator().manual_seed(args.seed)
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size], generator=generator)
    val_dataset.dataset.transform = eval_transform

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    device = torch.device(args.device)
    model = build_model().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    print(json.dumps({
        "data": str(data_dir),
        "classes": full_dataset.classes,
        "class_counts": class_counts(full_dataset),
        "train_size": train_size,
        "val_size": val_size,
        "device": str(device),
    }, ensure_ascii=False, indent=2))

    best_val_accuracy = 0.0
    best_state = None
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss_sum = 0.0
        train_total = 0

        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss_sum += loss.item() * labels.size(0)
            train_total += labels.size(0)

        metrics = accuracy(model, val_loader, device)
        row = {
            "epoch": epoch,
            "train_loss": train_loss_sum / max(train_total, 1),
            "val_loss": metrics["loss"],
            "val_accuracy": metrics["accuracy"],
        }
        history.append(row)
        print(json.dumps(row, ensure_ascii=False))

        if metrics["accuracy"] >= best_val_accuracy:
            best_val_accuracy = metrics["accuracy"]
            best_state = {key: value.detach().cpu() for key, value in model.state_dict().items()}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model": "mobilenet_v3_small",
        "labels": LABELS,
        "state_dict": best_state or model.state_dict(),
        "image_size": 224,
        "history": history,
    }, output_path)
    print(json.dumps({"saved": str(output_path), "best_val_accuracy": best_val_accuracy}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
