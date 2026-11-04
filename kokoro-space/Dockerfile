FROM python:3.11-slim
RUN useradd -m -u 1000 user
WORKDIR /app
RUN pip install --no-cache-dir "kokoro-onnx==0.6.1" "soundfile>=0.12" fastapi "uvicorn[standard]"
ADD https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx /app/kokoro-v1.0.onnx
ADD https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin /app/voices-v1.0.bin
COPY app.py /app/app.py
RUN chown -R user /app
USER user
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
