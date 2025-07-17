from shapely.geometry import Polygon, Point
from ultralytics import YOLO
from sort import Sort
import cv2
import os
import numpy as np

model = YOLO(r"C:\Users\DELL\Downloads\Zero Index Capstone Project Front End\assets\model\best.pt")
tracker = Sort()

zone_definitions = {
    "cam1": {
        "safe": [[481,504],[532,236],[587,240],[854,504]],
        "warning": [[313,504],[506,235],[527,235],[473,502]],
        "danger": [[239,505],[492,235],[502,235],[305,505]]
    },
    "cam2": {
        "safe": [[620,505],[522,5],[686,2],[888,504]],
        "warning": [[615,505],[561,505],[504,2],[518,3]],
        "danger": [[523,505],[555,504],[501,2],[495,2]]
    },
    "cam3": {
        "safe": [[624,505],[345,225],[321,225],[202,504]],
        "warning": [[728,505],[631,505],[346,224],[350,224]],
        "danger": [[844,505],[734,505],[350,222],[354,222]]
    }
}

def run_detection(video_path, camera_name="cam1", save_annotated=True):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    zones = zone_definitions[camera_name]
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
        detections = []

        results = model.predict(source=frame, conf=0.5, save=False)

        # Draw zones
        for zone, pts in zones.items():
            color = (0, 255, 0) if zone == "safe" else (0, 255, 255) if zone == "warning" else (0, 0, 255)
            cv2.polylines(frame, [cv2.UMat(np.array(pts, np.int32))], isClosed=True, color=color, thickness=2)

        for result in results:
            for box, cls in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.cls.cpu().numpy()):
                if int(cls) != 0:
                    continue
                x1, y1, x2, y2 = map(float, box[:4])
                conf = float(result.boxes.conf[0])
                detections.append([x1, y1, x2, y2, conf])

        # Update SORT tracker
        tracked_objects = tracker.update(np.array(detections))

        for obj in tracked_objects:
            x1, y1, x2, y2, track_id = obj.astype(int)
            cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
            point = Point(cx, cy)

            breach_type = None
            color = (0, 255, 0)
            label = f"Safe | ID:{track_id}"

            if zone_polygons["danger"].contains(point):
                breach_type = "Danger"
                red_total += 1
                color = (0, 0, 255)
                label = f"Danger | ID:{track_id}"
            elif zone_polygons["warning"].contains(point):
                breach_type = "Warning"
                yellow_total += 1
                color = (0, 255, 255)
                label = f"Warning | ID:{track_id}"

            if breach_type:
                breach_log.append({
                    "time": round(frame_id / fps, 2),
                    "zone": breach_type,
                    "position": [cx, cy],
                    "id": int(track_id)
                })

            person_total += 1
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.circle(frame, (cx, cy), 5, color, -1)

        if save_annotated:
            out.write(frame)

    cap.release()
    if save_annotated:
        out.release()

    return {
        "total_passengers": person_total,
        "breach_counts": {
            "Danger": red_total,
            "Warning": yellow_total
        },
        "breaches": breach_log,
        "annotated_video": output_path if save_annotated else None
    }