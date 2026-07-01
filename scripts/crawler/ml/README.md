# PosterLink Poster AI

PosterLink's first in-house poster verification model is a small binary image classifier:

- `poster`: real public poster, flyer, recruitment/event/program graphic
- `not_poster`: facility guide, schedule, fee table, generic notice, logo, unrelated image, wrong attachment

The first model uses transfer learning from MobileNetV3 Small. It is intentionally small so it can be trained and iterated quickly from admin review data.

## 1. Export Labeled Images

Admin review states become the first training labels:

- `published` -> `poster`
- `rejected` -> `not_poster`

```bash
cd scripts/crawler
npm run ai:export -- --output=data/ai-poster-dataset --limit=1000
```

The exporter creates:

```text
data/ai-poster-dataset/
  poster/
  not_poster/
  manifest.jsonl
```

Use `manifest.jsonl` to audit noisy labels. The first investment-worthy moat is the dataset, so keep rejected examples such as facility-use guides and wrong-image notices.

## 2. Install Training Dependencies

```bash
cd scripts/crawler
python -m venv .venv
.venv\Scripts\activate
pip install -r ml/requirements.txt
```

On macOS/Linux:

```bash
source .venv/bin/activate
```

## 3. Train

```bash
python ml/train_poster_classifier.py --data=data/ai-poster-dataset --output=data/ai-models/poster_classifier.pt --epochs=8
```

The script prints validation accuracy per epoch and saves the best model checkpoint.

## 4. Predict One Image

```bash
python ml/predict_poster.py --model=data/ai-models/poster_classifier.pt --image=data/ai-poster-dataset/poster/example.jpg
```

Output:

```json
{
  "isPoster": true,
  "confidence": 0.91,
  "threshold": 0.65,
  "label": "poster",
  "scores": {
    "not_poster": 0.09,
    "poster": 0.91
  }
}
```

## 5. Use The Local Model In The Crawler

Set these crawler environment variables:

```env
POSTER_IMAGE_CLASSIFIER=auto
POSTER_LOCAL_MODEL_PATH=data/ai-models/poster_classifier.pt
POSTER_LOCAL_MODEL_THRESHOLD=0.65
POSTER_AI_PYTHON=python
```

When `POSTER_LOCAL_MODEL_PATH` is set, `src/poster-image-classifier.js` calls this local model before any OpenAI check. If the model says `not_poster`, the crawler skips the post.

## Next Iterations

1. Add a dedicated rejection reason for `not_poster`, `wrong_image`, `facility_guide`, and `document_notice`.
2. Add an admin action that stores corrected labels for training.
3. Track false positives and false negatives from crawler runs in `manifest.jsonl`.
4. Add OCR/title matching as a second model stage.
