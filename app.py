#!/usr/bin/env python
# coding: utf-8

# In[20]:


get_ipython().system('pip install ultralytics --user')


# In[2]:


pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121


# In[4]:


import torch

print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version used by PyTorch: {torch.version.cuda}")
print(f"Number of GPUs: {torch.cuda.device_count()}")

if torch.cuda.is_available():
    print(f"Current GPU: {torch.cuda.get_device_name(0)}")
    
    # Test CUDA
    x = torch.rand(5, 3)
    print(f"\nTensor on CPU: {x}")
    
    x = x.cuda()
    print(f"Tensor on GPU: {x}")
    print(f"Is tensor on CUDA? {x.is_cuda}")


# In[1]:


# Test each import separately to find which one is slow
import time

print("Testing imports...")

start = time.time()
import os
print(f"✓ os: {time.time() - start:.2f}s")

start = time.time()
import sys
print(f"✓ sys: {time.time() - start:.2f}s")

start = time.time()
import torch
print(f"✓ torch: {time.time() - start:.2f}s")

start = time.time()
from flask import Flask, request, jsonify
print(f"✓ flask: {time.time() - start:.2f}s")

start = time.time()
from ultralytics import YOLO
print(f"✓ ultralytics: {time.time() - start:.2f}s")

start = time.time()
import cv2
print(f"✓ cv2: {time.time() - start:.2f}s")

start = time.time()
import numpy as np
print(f"✓ numpy: {time.time() - start:.2f}s")

print("\nAll imports successful!")


# In[2]:


import os
import sys
import torch
from flask_cors import CORS  # <-- ADD THIS LINE HERE
from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
from datetime import datetime
import traceback

class SubwayDetectionServer:
    def __init__(self, model_path):
        self.app = Flask(__name__)
        CORS(self.app)  # <-- ADD THIS LINE HERE
        self.model_path = model_path
        self.model = None
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        # Statistics
        self.stats = {
            "total_detections": 0,
            "yellow_line_breaches": 0,
            "platform_edge_breaches": 0,
            "breach_logs": []
        }
        
        # Print system info
        print(f"Using device: {self.device}")
        if self.device == 'cuda':
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"CUDA version: {torch.version.cuda}")
        
        # Load model
        self.load_model()
        
        # Setup routes
        self.setup_routes()
    
    def load_model(self):
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model not found at: {self.model_path}")
        
        try:
            print(f"Loading model from: {self.model_path}")
            self.model = YOLO(self.model_path)
            self.model.to(self.device)
            
            # Warm up the model
            dummy_img = np.zeros((640, 640, 3), dtype=np.uint8)
            _ = self.model(dummy_img)
            
            print(f"✓ Model loaded successfully on {self.device}")
        except Exception as e:
            print(f"✗ Error loading model: {e}")
            traceback.print_exc()
            raise
    
    def check_breach_type(self, x1, y1, x2, y2, image_shape):
        """Determine breach type based on bounding box position"""
        height = image_shape[0]
        
        # Bottom of the person bounding box
        person_bottom = y2
        
        # Define zones (adjust these based on your camera angle)
        platform_edge_zone = height * 0.85  # Bottom 15% is platform edge
        yellow_line_zone = height * 0.65     # 65-85% is yellow line zone
        
        if person_bottom > platform_edge_zone:
            return "platform_edge"
        elif person_bottom > yellow_line_zone:
            return "yellow_line"
        
        return None
    
    def setup_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health():
            gpu_info = {}
            if self.device == 'cuda':
                gpu_info = {
                    "gpu_name": torch.cuda.get_device_name(0),
                    "memory_allocated": f"{torch.cuda.memory_allocated(0) / 1024**2:.2f} MB",
                    "memory_reserved": f"{torch.cuda.memory_reserved(0) / 1024**2:.2f} MB",
                    "cuda_version": torch.version.cuda
                }
            
            return jsonify({
                "status": "running",
                "model_loaded": self.model is not None,
                "device": self.device,
                "gpu_info": gpu_info,
                "model_path": self.model_path,
                "timestamp": datetime.now().isoformat()
            })
        
        @self.app.route('/detect', methods=['POST'])
        def detect():
            if self.model is None:
                return jsonify({"success": False, "error": "Model not loaded"}), 500
            
            try:
                file = request.files.get('image')
                if not file:
                    return jsonify({"success": False, "error": "No image provided"}), 400
                
                # Read and decode image
                image_bytes = file.read()
                nparr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if image is None:
                    return jsonify({"success": False, "error": "Invalid image"}), 400
                
                # Run inference on GPU with automatic mixed precision
                with torch.cuda.amp.autocast(enabled=(self.device == 'cuda')):
                    results = self.model(image)
                
                detections = []
                for r in results:
                    boxes = r.boxes
                    if boxes is not None:
                        for box in boxes:
                            # Move tensors to CPU for numpy conversion
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            confidence = box.conf[0].cpu().numpy()
                            class_id = int(box.cls[0].cpu().numpy())
                            
                            # Check breach type based on position
                            breach_type = self.check_breach_type(x1, y1, x2, y2, image.shape)
                            
                            detection = {
                                "x1": int(x1),
                                "y1": int(y1),
                                "x2": int(x2),
                                "y2": int(y2),
                                "confidence": float(confidence),
                                "class": class_id,
                                "label": "person",
                                "breach_type": breach_type
                            }
                            detections.append(detection)
                            
                            # Update statistics
                            self.stats["total_detections"] += 1
                            if breach_type == "yellow_line":
                                self.stats["yellow_line_breaches"] += 1
                            elif breach_type == "platform_edge":
                                self.stats["platform_edge_breaches"] += 1
                
                return jsonify({
                    "success": True,
                    "detections": detections,
                    "count": len(detections),
                    "device": self.device
                })
                
            except Exception as e:
                print(f"Detection error: {e}")
                traceback.print_exc()
                return jsonify({"success": False, "error": str(e)}), 500
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            return jsonify(self.stats)
        
        @self.app.route('/stats/reset', methods=['POST'])
        def reset_stats():
            self.stats = {
                "total_detections": 0,
                "yellow_line_breaches": 0,
                "platform_edge_breaches": 0,
                "breach_logs": []
            }
            return jsonify({"success": True, "message": "Statistics reset"})
        
        @self.app.route('/log_breach', methods=['POST'])
        def log_breach():
            try:
                data = request.get_json()
                breach_entry = {
                    "type": data.get("type"),
                    "location": data.get("location"),
                    "timestamp": data.get("timestamp", datetime.now().isoformat())
                }
                
                self.stats["breach_logs"].append(breach_entry)
                
                # Keep only last 100 entries
                if len(self.stats["breach_logs"]) > 100:
                    self.stats["breach_logs"] = self.stats["breach_logs"][-100:]
                
                return jsonify({"success": True})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 400
    
    def run(self, **kwargs):
        """Run the Flask server"""
        self.app.run(**kwargs)


# In[4]:


import os

# Your model path
MODEL_PATH = r"C:\Users\DELL\Downloads\Zero Index Capstone Project Front End\assets\model\best.pt"

# Verify the file exists
if os.path.exists(MODEL_PATH):
    print(f"✓ Model found at: {MODEL_PATH}")
    print(f"File size: {os.path.getsize(MODEL_PATH) / 1024 / 1024:.2f} MB")
else:
    print(f"✗ Model not found at: {MODEL_PATH}")
    print("Please check the path and try again")


# In[ ]:


# Start the server with your model
if os.path.exists(MODEL_PATH):
    try:
        # Create and run the server
        server = SubwayDetectionServer(MODEL_PATH)
        
        print("\n" + "="*50)
        print("🚀 Subway Detection Server is running!")
        print("="*50)
        print(f"✓ Model: best.pt")
        print(f"✓ Device: {server.device}")
        if server.device == 'cuda':
            print(f"✓ GPU: {torch.cuda.get_device_name(0)}")
        print(f"\nEndpoints:")
        print(f"  • Health check: http://localhost:5000/health")
        print(f"  • Detection: http://localhost:5000/detect")
        print(f"  • Statistics: http://localhost:5000/stats")
        print("\n⚠️  Press 'Interrupt' button or Kernel → Interrupt to stop")
        print("="*50 + "\n")
        
        # Run the server
        server.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
        
    except KeyboardInterrupt:
        print("\n\n✓ Server stopped by user")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        import traceback
        traceback.print_exc()
else:
    print(f"❌ Cannot start server - model file not found at: {MODEL_PATH}")


# In[4]:


pip install flask-cors

