"""
SORT: A Simple, Online and Realtime Tracker
"""
import numpy as np
from filterpy.kalman import KalmanFilter

def linear_assignment(cost_matrix):
    try:
        import lap
        _, x, y = lap.lapjv(cost_matrix, extend_cost=True)
        return np.array([[y[i], i] for i in x if i >= 0])
    except ImportError:
        from scipy.optimize import linear_sum_assignment
        x, y = linear_sum_assignment(cost_matrix)
        return np.array(list(zip(x, y)))

def iou_batch(bb_test, bb_gt):
    """
    Computes IOU between two bboxes in the form [x1,y1,x2,y2]
    """
    bb_gt = np.expand_dims(bb_gt, 0)
    bb_test = np.expand_dims(bb_test, 1)
    
    xx1 = np.maximum(bb_test[..., 0], bb_gt[..., 0])
    yy1 = np.maximum(bb_test[..., 1], bb_gt[..., 1])
    xx2 = np.minimum(bb_test[..., 2], bb_gt[..., 2])
    yy2 = np.minimum(bb_test[..., 3], bb_gt[..., 3])
    w = np.maximum(0., xx2 - xx1)
    h = np.maximum(0., yy2 - yy1)
    wh = w * h
    o = wh / ((bb_test[..., 2] - bb_test[..., 0]) * (bb_test[..., 3] - bb_test[..., 1])
              + (bb_gt[..., 2] - bb_gt[..., 0]) * (bb_gt[..., 3] - bb_gt[..., 1]) - wh)
    return o

class KalmanBoxTracker(object):
    """
    This class represents the internal state of individual tracked objects observed as bbox.
    """
    count = 0
    
    def __init__(self, bbox):
        """
        Initialises a tracker using initial bounding box.
        """
        # Define constant velocity model
        self.kf = KalmanFilter(dim_x=7, dim_z=4)
        self.kf.F = np.array([[1,0,0,0,1,0,0],
                              [0,1,0,0,0,1,0],
                              [0,0,1,0,0,0,1],
                              [0,0,0,1,0,0,0],
                              [0,0,0,0,1,0,0],
                              [0,0,0,0,0,1,0],
                              [0,0,0,0,0,0,1]])
        self.kf.H = np.array([[1,0,0,0,0,0,0],
                              [0,1,0,0,0,0,0],
                              [0,0,1,0,0,0,0],
                              [0,0,0,1,0,0,0]])
        
        self.kf.R[2:, 2:] *= 5.  # Was 10
        self.kf.P[4:, 4:] *= 500.  # Was 1000
        self.kf.P *= 5.  # Was 10
        self.kf.Q[-1, -1] *= 0.05  # Was 0.01
        self.kf.Q[4:, 4:] *= 0.05  # Was 0.01
        
        self.kf.x[:4] = self.convert_bbox_to_z(bbox)
        self.time_since_update = 0
        # Don't assign ID here anymore
        # self.id = KalmanBoxTracker.count
        # KalmanBoxTracker.count += 1
        self.history = []
        self.hits = 0
        self.hit_streak = 0
        self.age = 0
        
        # Instead use temporary ID
        self.id = -1  # Temporary ID
        self.confirmed = False
    
    def confirm_track(self):
        """Assign permanent ID only when track is confirmed"""
        if not self.confirmed and self.id == -1:
            self.id = KalmanBoxTracker.count
            KalmanBoxTracker.count += 1
            self.confirmed = True
    
    def update(self, bbox):
        """
        Updates the state vector with observed bbox.
        """
        self.time_since_update = 0
        self.history = []
        self.hits += 1
        self.hit_streak += 1
        self.kf.update(self.convert_bbox_to_z(bbox))
    
    def predict(self):
        """
        Advances the state vector and returns the predicted bounding box estimate.
        """
        if((self.kf.x[6]+self.kf.x[2])<=0):
            self.kf.x[6] *= 0.0
        self.kf.predict()
        self.age += 1
        if(self.time_since_update>0):
            self.hit_streak = 0
        self.time_since_update += 1
        self.history.append(self.convert_x_to_bbox(self.kf.x))
        return self.history[-1]
    
    def get_state(self):
        """
        Returns the current bounding box estimate.
        """
        return self.convert_x_to_bbox(self.kf.x)
    
    @staticmethod
    def convert_bbox_to_z(bbox):
        """
        Takes a bounding box in the form [x1,y1,x2,y2] and returns z in the form
        [x,y,s,r] where x,y is the centre of the box and s is the scale/area and r is
        the aspect ratio
        """
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = bbox[0] + w/2.
        y = bbox[1] + h/2.
        s = w * h
        r = w / float(h) if h != 0 else 1.0
        return np.array([x, y, s, r]).reshape((4, 1))
    
    @staticmethod
    def convert_x_to_bbox(x):
        """
        Takes a bounding box in the centre form [x,y,s,r] and returns it in the form
        [x1,y1,x2,y2] where x1,y1 is the top left and x2,y2 is the bottom right
        """
        w = np.sqrt(x[2] * x[3])
        h = x[2] / w if w != 0 else 0
        return np.array([x[0]-w/2., x[1]-h/2., x[0]+w/2., x[1]+h/2.]).reshape((1, 4))

class Sort(object):
    def __init__(self, max_age=1, min_hits=3, iou_threshold=0.3):
        """
        Sets key parameters for SORT
        """
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.trackers = []
        self.frame_count = 0
    
    def update(self, dets=np.empty((0, 5))):
        """
        Params:
          dets - a numpy array of detections in the format [[x1,y1,x2,y2,score],[x1,y1,x2,y2,score],...]
        Requires: this method must be called once for each frame even with empty detections (use np.empty((0, 5)) for frames without detections).
        Returns the a similar array, where the last column is the object ID.

        NOTE: The number of objects returned may differ from the number of detections provided.
        """
        self.frame_count += 1
        
        # Get predicted locations from existing trackers
        trks = np.zeros((len(self.trackers), 5))
        to_del = []
        ret = []
        
        for t, trk in enumerate(self.trackers):
            pos = trk.predict()[0]
            trks[t] = [pos[0], pos[1], pos[2], pos[3], 0]
            if np.any(np.isnan(pos)):
                to_del.append(t)
        
        trks = np.ma.compress_rows(np.ma.masked_invalid(trks))
        for t in reversed(to_del):
            self.trackers.pop(t)
        
        matched, unmatched_dets, unmatched_trks = self.associate_detections_to_trackers(dets, trks)
        
        # Update matched trackers with assigned detections
        for m in matched:
            self.trackers[m[1]].update(dets[m[0], :])
        
        # Create and initialise new trackers for unmatched detections
        for i in unmatched_dets:
            trk = KalmanBoxTracker(dets[i, :])
            self.trackers.append(trk)
        
        i = len(self.trackers)
        for trk in reversed(self.trackers):
            d = trk.get_state()[0]
            if (trk.time_since_update < 1) and (trk.hit_streak >= self.min_hits or self.frame_count <= self.min_hits):
                # Confirm track if not already confirmed
                if not hasattr(trk, 'confirmed') or not trk.confirmed:
                    if hasattr(trk, 'confirm_track'):
                        trk.confirm_track()
                    else:
                        # Fallback if confirm_track method doesn't exist
                        trk.confirmed = True
                
                if trk.id >= 0:  # Only return tracks with valid IDs
                    ret.append(np.concatenate((d, [trk.id+1])).reshape(1, -1))
            i -= 1
            # Remove dead tracklet
            if(trk.time_since_update > self.max_age):
                self.trackers.pop(i)
        
        if(len(ret)>0):
            return np.concatenate(ret)
        return np.empty((0, 5))
    
    def associate_detections_to_trackers(self, detections, trackers):
        """
        Assigns detections to tracked object (both represented as bounding boxes)
        Returns 3 lists of matches, unmatched_detections and unmatched_trackers
        """
        if(len(trackers)==0):
            return np.empty((0,2),dtype=int), np.arange(len(detections)), np.empty((0,5),dtype=int)
        
        iou_matrix = iou_batch(detections, trackers)
        
        if min(iou_matrix.shape) > 0:
            a = (iou_matrix > self.iou_threshold).astype(np.int32)
            if a.sum(1).max() == 1 and a.sum(0).max() == 1:
                matched_indices = np.stack(np.where(a), axis=1)
            else:
                matched_indices = linear_assignment(-iou_matrix)
        else:
            matched_indices = np.empty(shape=(0,2))
        
        unmatched_detections = []
        for d, det in enumerate(detections):
            if(d not in matched_indices[:,0]):
                unmatched_detections.append(d)
        
        unmatched_trackers = []
        for t, trk in enumerate(trackers):
            if(t not in matched_indices[:,1]):
                unmatched_trackers.append(t)
        
        # Filter out matched with low IOU
        matches = []
        for m in matched_indices:
            if(iou_matrix[m[0], m[1]]<self.iou_threshold):
                unmatched_detections.append(m[0])
                unmatched_trackers.append(m[1])
            else:
                matches.append(m.reshape(1,2))
        
        if(len(matches)==0):
            matches = np.empty((0,2),dtype=int)
        else:
            matches = np.concatenate(matches,axis=0)
        
        return matches, np.array(unmatched_detections), np.array(unmatched_trackers)