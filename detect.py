from shapely.geometry import Polygon, Point
from ultralytics import YOLO
import cv2

model = YOLO("model/best.pt")  

zone_definitions = {
    "cam1": {
        {"safe": [[975,959],[1066,460],[1186,460],[1680,958]],
        "warning": [[610,959],[961,959],[1055,459],[1006,456]],
        "danger": [[505,959],[990,454],[999,454],[590,958]]}
    },
    "cam2": {
        "safe":    [[1395,995],[1909,993],[1473,5],[1207,5]],
        "warning": [[1336,994],[1372,996],[1186,3],[1176,5]],
        "danger":  [[1184,995],[1262,996],[1155,6],[1142,6]]
    }
    
}
def run_detection(video_path, camera_name="cam1"):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    zones = zone_definitions[camera_name]
    zone_polygons = {z: Polygon(pts) for z, pts in zones.items()}

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

        for result in results:
            for box, cls in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.cls.cpu().numpy()):
                if int(cls) != 0:
                    continue
                x1, y1, x2, y2 = map(int, box[:4])
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                point = Point(cx, cy)

                breach_type = None
                if zone_polygons["danger"].contains(point):
                    breach_type = "Danger"
                    red_total += 1
                elif zone_polygons["warning"].contains(point):
                    breach_type = "Warning"
                    yellow_total += 1

                if breach_type:
                    breach_log.append({
                        "time": round(frame_id / fps, 2),
                        "zone": breach_type,
                        "position": [cx, cy]
                    })
                person_total += 1

    cap.release()

    return {
        "total_passengers": person_total,
        "breach_counts": {
            "Danger": red_total,
            "Warning": yellow_total
        },
        "breaches": breach_log
    }