#!/usr/bin/env python
# coding: utf-8

# In[1]:


#Install muna ito
get_ipython().system('pip install ultralytics --user')


# In[3]:


#then ito
#dapat nvidia gpu and version 12.9 ang cuda
#adjust code kung iba version ng cuda
#kapag hindi nvidia gpu, i-gpt na lang kung paano ilipat from GPU to CPU
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


# In[4]:


#kapag okay na sa setup and install, I-run muna ito para maload ang model
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


# In[7]:


#FLASK SETUP WITH DETECT.PY RUN_DETECT LOGIC
#Run this cell before startin the server.
import os
import sys
import torch
from flask_cors import CORS
from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
from datetime import datetime
import traceback
from shapely.geometry import Polygon, Point

# Add the path where detect.py is located
detect_path = r"C:\Users\DELL\Downloads\Zero Index Capstone Project Front End"
if detect_path not in sys.path:
    sys.path.append(detect_path)

# Import from detect.py
from detect import zone_definitions

# Your model path
MODEL_PATH = r"C:\Users\DELL\Downloads\Zero Index Capstone Project Front End\assets\model\best.pt"

class SubwayDetectionServer:
    def __init__(self, model_path):
        self.app = Flask(__name__)
        CORS(self.app)
        self.model_path = model_path
        self.model = None
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        # Use zones from detect.py
        self.zone_definitions = zone_definitions
        
        # Statistics
        self.stats = {
            "total_detections": 0,
            "danger_breaches": 0,
            "warning_breaches": 0,
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
            with torch.no_grad():
                _ = self.model(dummy_img)
            
            print(f"✓ Model loaded successfully on {self.device}")
        except Exception as e:
            print(f"✗ Error loading model: {e}")
            traceback.print_exc()
            raise
    
    def check_zone_breach_foot(self, x1, y1, x2, y2, camera_name="cam1"):
        """Check if a person's foot position is in danger or warning zone"""
        zones = self.zone_definitions.get(camera_name, self.zone_definitions["cam1"])
        
        # Calculate foot position (bottom center of bounding box)
        foot_x = int((x1 + x2) / 2)
        foot_y = int(y2)  # Bottom of the bounding box
        
        # Create polygons
        point = Point(foot_x, foot_y)
        danger_polygon = Polygon(zones["danger"])
        warning_polygon = Polygon(zones["warning"])
        
        breach_type = None
        if danger_polygon.contains(point):
            breach_type = "danger"
        elif warning_polygon.contains(point):
            breach_type = "warning"
        
        return breach_type, (foot_x, foot_y)
    
    def process_frame(self, image, camera_name="cam1"):
        """Process a single frame using the detection logic from detect.py"""
        zones = self.zone_definitions.get(camera_name, self.zone_definitions["cam1"])
        zone_polygons = {z: Polygon(pts) for z, pts in zones.items()}
        
        # Run model prediction
        results = self.model.predict(source=image, conf=0.5, save=False)
        
        detections = []
        frame_passengers = 0
        
        for result in results:
            if result.boxes is None:
                continue
                
            boxes = result.boxes.xyxy.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            classes = result.boxes.cls.cpu().numpy().astype(int)
            
            for box, conf, cls in zip(boxes, confidences, classes):
                # Only process person class (class 0)
                if cls != 0:
                    continue
                
                x1, y1, x2, y2 = map(int, box[:4])
                
                # Use foot approximation (bottom center of bounding box)
                foot_x = int((x1 + x2) / 2)
                foot_y = int(y2)
                foot_point = Point(foot_x, foot_y)
                
                # Check zone breach using foot position
                breach_type = None
                if zone_polygons["danger"].contains(foot_point):
                    breach_type = "danger"
                    self.stats["danger_breaches"] += 1
                elif zone_polygons["warning"].contains(foot_point):
                    breach_type = "warning"
                    self.stats["warning_breaches"] += 1
                
                frame_passengers += 1
                self.stats["total_detections"] += 1
                
                # Create detection object
                detection = {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": float(conf),
                    "class": int(cls),
                    "label": "person",
                    "breach_type": breach_type,
                    "center": [int((x1 + x2) / 2), int((y1 + y2) / 2)],
                    "foot_position": [foot_x, foot_y]  # Add foot position
                }
                detections.append(detection)
                
                # Log breach if detected
                if breach_type:
                    self.stats["breach_logs"].append({
                        "timestamp": datetime.now().isoformat(),
                        "zone": breach_type,
                        "position": [foot_x, foot_y],
                        "camera": camera_name
                    })
        
        return detections, frame_passengers
    
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
                camera_name = request.form.get('camera', 'cam1')
                
                if not file:
                    return jsonify({"success": False, "error": "No image provided"}), 400
                
                # Read and decode image
                image_bytes = file.read()
                nparr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if image is None:
                    return jsonify({"success": False, "error": "Invalid image"}), 400
                
                # Process frame using the logic from detect.py
                with torch.cuda.amp.autocast(enabled=(self.device == 'cuda')):
                    with torch.no_grad():
                        detections, passenger_count = self.process_frame(image, camera_name)
                
                return jsonify({
                    "success": True,
                    "detections": detections,
                    "count": len(detections),
                    "device": self.device,
                    "camera": camera_name
                })
                
            except Exception as e:
                print(f"Detection error: {e}")
                traceback.print_exc()
                return jsonify({"success": False, "error": str(e)}), 500
        
        @self.app.route('/zones/<camera_name>', methods=['GET'])
        def get_zones(camera_name):
            """Get zone definitions for a specific camera"""
            zones = self.zone_definitions.get(camera_name)
            if zones:
                return jsonify({
                    "success": True,
                    "camera": camera_name,
                    "zones": zones
                })
            else:
                return jsonify({
                    "success": False,
                    "error": f"No zones defined for camera: {camera_name}"
                }), 404
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            return jsonify({
                "total_passengers": self.stats["total_detections"],
                "breach_counts": {
                    "danger": self.stats["danger_breaches"],
                    "warning": self.stats["warning_breaches"]
                },
                "breach_logs": self.stats["breach_logs"][-10:]  # Return last 10 breach logs
            })
        
        @self.app.route('/stats/reset', methods=['POST'])
        def reset_stats():
            self.stats = {
                "total_detections": 0,
                "danger_breaches": 0,
                "warning_breaches": 0,
                "breach_logs": []
            }
            return jsonify({"success": True, "message": "Statistics reset"})
        
        @self.app.route('/log_breach', methods=['POST'])
        def log_breach():
            """Log a breach event from the frontend"""
            try:
                data = request.json
                breach_type = data.get('type')
                location = data.get('location')
                timestamp = data.get('timestamp', datetime.now().isoformat())
                
                # Map frontend breach types to our internal types
                if breach_type == 'yellow_line':
                    internal_type = 'warning'
                elif breach_type == 'platform_edge':
                    internal_type = 'danger'
                else:
                    internal_type = breach_type
                
                breach_entry = {
                    "timestamp": timestamp,
                    "zone": internal_type,
                    "location": location,
                    "camera": data.get('camera', 'unknown')
                }
                
                self.stats["breach_logs"].append(breach_entry)
                
                # Keep only last 100 entries to prevent memory issues
                if len(self.stats["breach_logs"]) > 100:
                    self.stats["breach_logs"] = self.stats["breach_logs"][-100:]
                
                return jsonify({"success": True, "message": "Breach logged"})
                
            except Exception as e:
                print(f"Error logging breach: {e}")
                return jsonify({"success": False, "error": str(e)}), 500
        
        @self.app.route('/process_video', methods=['POST'])
        def process_video():
            """Process an entire video file (similar to run_detection in detect.py)"""
            try:
                file = request.files.get('video')
                camera_name = request.form.get('camera', 'cam1')
                save_annotated = request.form.get('save_annotated', 'true').lower() == 'true'
                
                if not file:
                    return jsonify({"success": False, "error": "No video provided"}), 400
                
                # Save uploaded video temporarily
                temp_video_path = os.path.join('temp', 'uploaded_video.mp4')
                os.makedirs('temp', exist_ok=True)
                file.save(temp_video_path)
                
                # Process video
                result = self.process_video_file(temp_video_path, camera_name, save_annotated)
                
                # Clean up temp file
                os.remove(temp_video_path)
                
                return jsonify({
                    "success": True,
                    "result": result
                })
                
            except Exception as e:
                print(f"Video processing error: {e}")
                traceback.print_exc()
                return jsonify({"success": False, "error": str(e)}), 500
    
    def process_video_file(self, video_path, camera_name="cam1", save_annotated=True):
        """Process a video file using the same logic as run_detection in detect.py"""
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        zones = self.zone_definitions[camera_name]
        zone_polygons = {z: Polygon(pts) for z, pts in zones.items()}
        
        output_path = None
        if save_annotated:
            output_dir = "annotated"
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, os.path.basename(video_path))
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        frame_id = 0
        breach_log = []
        person_total = 0
        red_total = 0
        yellow_total = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_id += 1
            
            # Run model prediction
            results = self.model.predict(source=frame, conf=0.5, save=False)
            
            # Draw zones
            for zone, pts in zones.items():
                color = (0, 255, 0) if zone == "safe" else (0, 255, 255) if zone == "warning" else (0, 0, 255)
                pts_array = np.array(pts, np.int32)
                cv2.polylines(frame, [pts_array], isClosed=True, color=color, thickness=2)
            
            for result in results:
                if result.boxes is None:
                    continue
                    
                boxes = result.boxes.xyxy.cpu().numpy()
                classes = result.boxes.cls.cpu().numpy().astype(int)
                
                for box, cls in zip(boxes, classes):
                    if cls != 0:  # Only process person class
                        continue
                    
                    x1, y1, x2, y2 = map(int, box[:4])
                    
                    # Use foot position (bottom center of bounding box)
                    foot_x = int((x1 + x2) / 2)
                    foot_y = int(y2)
                    foot_point = Point(foot_x, foot_y)
                    
                    breach_type = None
                    color = (0, 255, 0)
                    label = "Safe"
                    
                    if zone_polygons["danger"].contains(foot_point):
                        breach_type = "Danger"
                        red_total += 1
                        color = (0, 0, 255)
                        label = "Danger"
                    elif zone_polygons["warning"].contains(foot_point):
                        breach_type = "Warning"
                        yellow_total += 1
                        color = (0, 255, 255)
                        label = "Warning"
                    
                    if breach_type:
                        breach_log.append({
                            "time": round(frame_id / fps, 2),
                            "zone": breach_type,
                            "position": [foot_x, foot_y]
                        })
                    
                    person_total += 1
                    
                    # Annotate person box and label
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                    # Draw foot position marker
                    cv2.circle(frame, (foot_x, foot_y), 5, color, -1)
                    # Draw line to indicate foot position
                    cv2.line(frame, (foot_x - 10, foot_y), (foot_x + 10, foot_y), color, 2)
            
            if save_annotated:
                out.write(frame)
        
        cap.release()
        if save_annotated:
            out.release()
        
        return {
            "total_passengers": person_total,
            "breach_counts": {
                "danger": red_total,
                "warning": yellow_total
            },
            "breaches": breach_log,
            "annotated_video": output_path if save_annotated else None
        }
    
    def run(self, **kwargs):
        """Run the Flask server"""
        self.app.run(**kwargs)


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

