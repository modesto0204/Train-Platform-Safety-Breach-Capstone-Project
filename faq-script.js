// Toggle FAQ item expansion
function toggleFAQ(questionElement) {
    const faqItem = questionElement.parentElement;
    const toggleIcon = questionElement.querySelector('.faq-toggle-icon');
    const isExpanded = faqItem.classList.contains('expanded');
    
    // Close all other FAQ items
    document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
            item.classList.remove('expanded');
            const icon = item.querySelector('.faq-toggle-icon');
            icon.src = 'assets/icons/faqplus_icon.png';
        }
    });
    
    // Toggle current FAQ item
    if (isExpanded) {
        faqItem.classList.remove('expanded');
        toggleIcon.src = 'assets/icons/faqplus_icon.png';
    } else {
        faqItem.classList.add('expanded');
        toggleIcon.src = 'assets/icons/faqmin_icon.png';
    }
}

// Navigation functions
function goToDashboard() {
    window.location.href = 'index.html';
}

function showHelp() {
    window.location.href = 'help.html';
}

// Optional: Add keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close all FAQ items
        document.querySelectorAll('.faq-item').forEach(item => {
            item.classList.remove('expanded');
            const icon = item.querySelector('.faq-toggle-icon');
            icon.src = 'assets/icons/faqplus_icon.png';
        });
    }
});