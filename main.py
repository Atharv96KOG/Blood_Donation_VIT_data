from flask import Flask, render_template, request, jsonify
import numpy as np
import cv2
from PIL import Image
import io
import base64
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor
import os

app = Flask(__name__)

# Load your trained model
model = XGBRegressor()
model.load_model('model.json')  # Make sure to include your trained model file

def extract_features(image):
    # Convert image to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Calculate basic features
    mean_intensity = np.mean(gray)
    std_intensity = np.std(gray)
    max_intensity = np.max(gray)
    min_intensity = np.min(gray)
    
    # Calculate histogram features
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    
    # Combine features
    features = np.array([
        mean_intensity,
        std_intensity,
        max_intensity,
        min_intensity,
        *hist[:10]  # Use first 10 histogram bins
    ])
    
    return features

def predict_hb(features):
    # Scale features
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features.reshape(1, -1))
    
    # Make prediction
    predicted_hb = model.predict(features_scaled)[0]
    return round(predicted_hb, 2)

@app.route('/')
def index():
    return render_template('import.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Read image file
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Extract features
        features = extract_features(image)
        
        # Make prediction
        predicted_hb = predict_hb(features)
        
        # Convert image to base64 for display
        _, buffer = cv2.imencode('.png', image)
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # Prepare features dictionary
        features_dict = {
            'Mean Intensity': round(float(np.mean(features[:1])), 2),
            'Standard Deviation': round(float(np.std(features[1:2])), 2),
            'Maximum Intensity': round(float(np.max(features[2:3])), 2),
            'Minimum Intensity': round(float(np.min(features[3:4])), 2)
        }
        
        return jsonify({
            'image_path': f'data:image/png;base64,{image_base64}',
            'predicted_hb': predicted_hb,
            'features': features_dict
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# For local development
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 