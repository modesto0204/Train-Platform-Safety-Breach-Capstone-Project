// Navigation functions
function goToDashboard() {
    window.location.href = 'index.html';
}

function showFAQ() {
    window.location.href = 'faq.html';
}

// Carousel functionality
let currentSlide = 0;
const slides = [
    'assets/icons/livemonitoring.png',
    'assets/icons/breachdetection.png',  // Add your other demo images
    'assets/icons/breachlog&breakdown1.png',
    'assets/icons/keycounts.png'
];

function getHelpItemIndex(slideIndex) {
    // All slides map directly except breach log variations
    if (slideIndex === 2) return 2; // Both breach log images map to index 2
    return slideIndex;
}

function updateSlideImage() {
    const demoImage = document.getElementById('demoImage');
    if (!demoImage) return;
    
    if (currentSlide === 2) {
        // Handle breach log sub-slides
        demoImage.src = breachLogSubSlide === 0 ? 
            'assets/icons/breachlog&breakdown1.png' : 
            'assets/icons/breachlog&breakdown2.png';
    } else {
        demoImage.src = slides[currentSlide];
    }
}

function updateDots() {
    const dots = document.querySelectorAll('.dot');
    const activeIndex = getHelpItemIndex(currentSlide);
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
    });
}

function updateActiveHelpItem() {
    const helpItems = document.querySelectorAll('.help-item');
    const activeIndex = getHelpItemIndex(currentSlide);
    helpItems.forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });
}

function goToSlide(slideIndex) {
    currentSlide = slideIndex;
    breachLogSubSlide = 0; // Reset sub-slide when directly selecting
    updateSlideImage();
    updateDots();
    updateActiveHelpItem();
}

function nextSlide() {
    if (currentSlide === 2 && breachLogSubSlide === 0) {
        // If we're on the first breach log image, show the second
        breachLogSubSlide = 1;
    } else {
        // Otherwise, move to next slide
        breachLogSubSlide = 0;
        currentSlide = (currentSlide + 1) % slides.length;
    }
    updateSlideImage();
    updateDots();
    updateActiveHelpItem();
}

function previousSlide() {
    if (currentSlide === 2 && breachLogSubSlide === 1) {
        // If we're on the second breach log image, show the first
        breachLogSubSlide = 0;
    } else {
        // Otherwise, move to previous slide
        if (currentSlide === 3) {
            // Coming back from Key Counts, might need to show second breach log
            currentSlide = 2;
            breachLogSubSlide = 1;
        } else {
            breachLogSubSlide = 0;
            currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        }
    }
    updateSlideImage();
    updateDots();
    updateActiveHelpItem();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    updateSlideImage();
    updateDots();
    updateActiveHelpItem();
    
    // Add click handlers to help items
    const helpItems = document.querySelectorAll('.help-item');
    helpItems.forEach((item, index) => {
        item.addEventListener('click', () => goToSlide(index));
        item.style.cursor = 'pointer';
    });
});