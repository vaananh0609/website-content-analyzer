from pathlib import Path
import threading
from typing import List

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, Pipeline, pipeline

from .text_utils import build_word_aware_chunks, clean_summary_text, normalize_text

MODEL_NAME = "sshleifer/distilbart-cnn-12-6"
MODEL_CACHE_DIR = Path("model-cache")
MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

DEVICE = 0 if torch.cuda.is_available() else -1
_SUMMARIZER: Pipeline | None = None
_SUMMARIZER_LOCK = threading.Lock()


def get_summarizer() -> Pipeline:
    global _SUMMARIZER
    if _SUMMARIZER is not None:
        return _SUMMARIZER
    with _SUMMARIZER_LOCK:
        if _SUMMARIZER is not None:
            return _SUMMARIZER
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            cache_dir=str(MODEL_CACHE_DIR),
        )
        model = AutoModelForSeq2SeqLM.from_pretrained(
            MODEL_NAME,
            cache_dir=str(MODEL_CACHE_DIR),
        )
        _SUMMARIZER = pipeline(
            "summarization",
            model=model,
            tokenizer=tokenizer,
            device=DEVICE,
        )
        return _SUMMARIZER


def summarize_text(text: str, min_length: int = 20, max_length: int = 50) -> str:
    if not text.strip():
        return ""

    summarizer = get_summarizer()
    output = summarizer(
        text,
        min_length=min_length,
        max_length=max_length,
        truncation=True,
        do_sample=False,
        num_beams=4,
        early_stopping=True,
        no_repeat_ngram_size=3,
        clean_up_tokenization_spaces=True,
    )
    if output and isinstance(output, list):
        return output[0].get("summary_text", "")
    return ""


def summarize_chunks(
    text: str,
    chunk_word_size: int,
    min_length: int,
    max_length: int,
) -> List[str]:
    segments = []
    for chunk in build_word_aware_chunks(text, chunk_word_size):
        if not chunk:
            continue
        summary = summarize_text(chunk, min_length=min_length, max_length=max_length)
        cleaned = clean_summary_text(summary)
        if cleaned:
            segments.append(cleaned)
    return segments


def count_words(text: str) -> int:
    cleaned = normalize_text(text).replace("\n", " ")
    if not cleaned:
        return 0
    return len([tok for tok in cleaned.split() if tok])
