from shapely.geometry import Polygon, Point
from ultralytics import YOLO
import cv2
import os
import numpy as np

model = YOLO("model/best.pt")
zone_definitions = {
    "cam1": {
        "safe": [[975, 959], [1066, 460], [1186, 460], [1680, 958]],
        "warning": [[610, 959], [961, 959], [1055, 459], [1006, 456]],
        "danger": [[505, 959], [990, 454], [999, 454], [590, 958]]
    },
    "cam2": {
        "safe": [[1395, 995], [1909, 993], [1473, 5], [1207, 5]],
        "warning": [[1336, 994], [1372, 996], [1186, 3], [1176, 5]],
        "danger": [[1184, 995], [1262, 996], [1155, 6], [1142, 6]]
    },
    "cam3": {
        "safe": [[1118, 1045], [1104, 660], [1202, 661], [1817, 1046]],
        "warning": [[969, 1045], [1068, 657], [1081, 657], [1076, 1044]],
        "danger": [[843, 1048], [899, 1046], [1053, 658], [1041, 658]]
    },
    "cam4": {
        "safe": [[1136, 1043], [1024, 4], [886, 4], [493, 1048]],
        "warning": [[1204, 1040], [1064, 3], [1049, 4], [1171, 1043]],
        "danger": [[1375, 1048], [1098, 4], [1078, 5], [1307, 1045]]
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
        results = model.predict(source=frame, conf=0.5, save=False)

        # Draw zones
        for zone, pts in zones.items():
            color = (0, 255, 0) if zone == "safe" else (0, 255, 255) if zone == "warning" else (0, 0, 255)
            cv2.polylines(frame, [cv2.UMat(np.array(pts, np.int32))], isClosed=True, color=color, thickness=2)

        for result in results:
            for box, cls in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.cls.cpu().numpy()):
                if int(cls) != 0:
                    continue
                x1, y1, x2, y2 = map(int, box[:4])
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                point = Point(cx, cy)

                breach_type = None
                color = (0, 255, 0)
                label = "Safe"

                if zone_polygons["danger"].contains(point):
                    breach_type = "Danger"
                    red_total += 1
                    color = (0, 0, 255)
                    label = "Danger"
                elif zone_polygons["warning"].contains(point):
                    breach_type = "Warning"
                    yellow_total += 1
                    color = (0, 255, 255)
                    label = "Warning"

                if breach_type:
                    breach_log.append({
                        "time": round(frame_id / fps, 2),
                        "zone": breach_type,
                        "position": [cx, cy]
                    })

                person_total += 1
                # Annotate person box and label
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
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