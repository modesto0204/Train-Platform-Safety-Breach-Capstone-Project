import numpy as np
from scipy.optimize import linear_sum_assignment

class BYTETracker:
    """Simplified ByteTracker without YOLOX dependencies"""
    
    def __init__(self, config):
        self.track_thresh = config.get("track_thresh", 0.5)
        self.track_buffer = config.get("track_buffer", 30)
        self.match_thresh = config.get("match_thresh", 0.8)
        self.min_box_area = config.get("min_box_area", 10)
        
        self.frame_id = 0
        self.next_id = 0
        self.tracks = {}
        self.lost_tracks = {}
        
    def update(self, detections, img_info=None, img_size=None):
        """
        Update tracker with new detections
        detections: numpy array of shape (N, 5) where each row is [x1, y1, x2, y2, score]
        """
        self.frame_id += 1
        
        if detections.shape[0] == 0:
            # Handle lost tracks
            lost_ids = []
            for track_id, track in list(self.tracks.items()):
                track['lost_count'] += 1
                if track['lost_count'] > self.track_buffer:
                    lost_ids.append(track_id)
            
            for track_id in lost_ids:
                del self.tracks[track_id]
            
            return self._format_tracks()
        
        # Filter by score and box area
        scores = detections[:, 4]
        keep = scores > self.track_thresh
        
        # Filter by box area
        if self.min_box_area > 0:
            box_areas = (detections[:, 2] - detections[:, 0]) * (detections[:, 3] - detections[:, 1])
            keep = keep & (box_areas > self.min_box_area)
        
        curr_dets = detections[keep]
        
        if len(self.tracks) == 0:
            # Initialize new tracks
            for det in curr_dets:
                self._init_track(det)
        else:
            # Match detections to existing tracks
            track_boxes = np.array([t['box'] for t in self.tracks.values()])
            ious = self._iou_batch(curr_dets[:, :4], track_boxes)
            
            # Hungarian matching
            matched_indices = self._linear_assignment(-ious)
            
            unmatched_dets = list(range(len(curr_dets)))
            unmatched_tracks = list(self.tracks.keys())
            
            matches = []
            for m in matched_indices:
                if m[0] < len(curr_dets) and m[1] < len(track_boxes):
                    if ious[m[0], m[1]] > 1 - self.match_thresh:
                        matches.append(m)
                        if m[0] in unmatched_dets:
                            unmatched_dets.remove(m[0])
                        track_id = list(self.tracks.keys())[m[1]]
                        if track_id in unmatched_tracks:
                            unmatched_tracks.remove(track_id)
            
            # Update matched tracks
            for m in matches:
                track_id = list(self.tracks.keys())[m[1]]
                self.tracks[track_id]['box'] = curr_dets[m[0], :4]
                self.tracks[track_id]['score'] = curr_dets[m[0], 4]
                self.tracks[track_id]['lost_count'] = 0
            
            # Create new tracks for unmatched detections
            for i in unmatched_dets:
                self._init_track(curr_dets[i])
            
            # Handle lost tracks
            for track_id in unmatched_tracks:
                self.tracks[track_id]['lost_count'] += 1
                if self.tracks[track_id]['lost_count'] > self.track_buffer:
                    del self.tracks[track_id]
        
        return self._format_tracks()
    
    def _init_track(self, det):
        """Initialize a new track"""
        self.tracks[self.next_id] = {
            'box': det[:4],
            'score': det[4],
            'lost_count': 0,
            'track_id': self.next_id
        }
        self.next_id += 1
    
    def _format_tracks(self):
        """Format tracks for output to match expected format"""
        output = []
        for track in self.tracks.values():
            if track['lost_count'] == 0:  # Only return visible tracks
                # Format: Return as object with attributes
                class Track:
                    pass
                t = Track()
                t.tlbr = track['box']  # x1, y1, x2, y2
                t.track_id = track['track_id']
                t.score = track['score']
                output.append(t)
        return output
    
    def _iou_batch(self, bb_test, bb_gt):
        """Calculate IoU between bounding boxes"""
        bb_gt = np.expand_dims(bb_gt, 0)
        bb_test = np.expand_dims(bb_test, 1)
        
        xx1 = np.maximum(bb_test[..., 0], bb_gt[..., 0])
        yy1 = np.maximum(bb_test[..., 1], bb_gt[..., 1])
        xx2 = np.minimum(bb_test[..., 2], bb_gt[..., 2])
        yy2 = np.minimum(bb_test[..., 3], bb_gt[..., 3])
        w = np.maximum(0., xx2 - xx1)
        h = np.maximum(0., yy2 - yy1)
        wh = w * h
        area_test = (bb_test[..., 2] - bb_test[..., 0]) * (bb_test[..., 3] - bb_test[..., 1])
        area_gt = (bb_gt[..., 2] - bb_gt[..., 0]) * (bb_gt[..., 3] - bb_gt[..., 1])
        iou = wh / (area_test + area_gt - wh + 1e-6)
        return iou
    
    def _linear_assignment(self, cost_matrix):
        """Solve linear assignment problem"""
        if cost_matrix.size == 0:
            return np.empty((0, 2), dtype=int)
        x, y = linear_sum_assignment(cost_matrix)
        return np.array(list(zip(x, y)))