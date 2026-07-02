import torch
from transformers import WhisperForConditionalGeneration

model_name = "openai/whisper-base"
model = WhisperForConditionalGeneration.from_pretrained(model_name, low_cpu_mem_usage=False)
model.to("cpu")
print("Model loaded. Devices:")
for n, p in model.named_parameters():
    if p.device.type != "cpu":
        print(n, p.device)
