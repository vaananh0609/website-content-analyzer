from typing import List, Literal, Optional

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from nlp.keywords import extract_keywords
from nlp.sentiment import detect_sentiment
from nlp.summary import count_words, summarize_chunks
from nlp.text_utils import normalize_whitespace, truncate_at_boundary

app = FastAPI(title="Website Content Analyzer NLP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


class AnalyzeRequest(BaseModel):
    text: str
    task: Literal["summary", "full"] = "summary"
    min_length: int = Field(25, ge=5)
    max_length: int = Field(90, ge=10)
    chunk_word_size: int = Field(1000, ge=50)
    title: Optional[str] = ""
    headings: List[str] = Field(default_factory=list)
    main_text: Optional[str] = Field("", alias="mainText")
    noise_text: Optional[str] = Field("", alias="noiseText")

    class Config:
        allow_population_by_field_name = True


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    word_count = count_words(req.text)
    normalized_text = normalize_whitespace(req.text)
    if not normalized_text:
        return {"error": "Empty text"}

    if req.max_length < req.min_length:
        return {"error": "max_length must be >= min_length"}

    truncated = truncate_at_boundary(normalized_text)

    if req.task == "summary":
        segments = summarize_chunks(truncated, req.chunk_word_size, req.min_length, req.max_length)
        if not segments:
            return {"error": "Unable to generate summary"}
        return {"summary": " ".join(segments)}

    if req.task == "full":
        page_headings = req.headings or []
        main_text = req.main_text or req.text
        noise_text = req.noise_text or ""
        segments = summarize_chunks(truncated, req.chunk_word_size, req.min_length, req.max_length)
        if not segments:
            return {"error": "Unable to generate summary"}
        keywords = extract_keywords(
            text=normalized_text,
            title=req.title or "",
            headings=page_headings,
            main_text=main_text,
            noise_text=noise_text,
        )
        sentiment = detect_sentiment(main_text or normalized_text)
        return {
            "summary": segments,
            "keywords": keywords,
            "sentiment": sentiment,
            "word_count": word_count,
        }

    return {"error": "Unsupported task"}
