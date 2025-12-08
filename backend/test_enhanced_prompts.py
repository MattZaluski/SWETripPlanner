"""
Test script to validate enhanced LLM prompts with various filters.
Tests different interest combinations, budgets, travel modes, and locations.
"""

from services import plan_trip_smart, plan_trip
import json
from datetime import datetime, timedelta

def test_case(name, data, mode="smart"):
    """Run a test case and display results"""
    print(f"\n{'='*70}")
    print(f"TEST: {name}")
    print(f"{'='*70}")
    print(f"Interests: {data.get('interests', [])}")
    print(f"Budget: {data.get('budget', 'medium')}")
    print(f"Location: {data.get('starting_address', 'N/A')}")
    print(f"Travel Mode: {data.get('travel_mode', 'driving-car')}")
    print()
    
    try:
        if mode == "smart":
            result = plan_trip_smart(data)
        else:
            result = plan_trip(data)
        
        items = result.get('itinerary', [])[:3]
        
        # Display first 3 items with detailed info
        for i, item in enumerate(items, 1):
            print(f"{i}. {item.get('name')}")
            print(f"   Score: {item.get('relevance_score')}%")
            print(f"   Reason: {item.get('matched_reason', 'N/A')}")
            print(f"   Cost: {item.get('cost', 'N/A')} | Travel: {item.get('travel_time_min', 'N/A')} min")
            print()
        
        return True
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

# Test 1: Cultural interests in Boston
test_case(
    "Cultural Interests (Museum + Art + History)",
    {
        "interests": ["museum", "art gallery", "historical site"],
        "starting_address": "Boston, MA",
        "budget": "medium",
        "travel_mode": "driving-car"
    }
)

# Test 2: Outdoor adventure
test_case(
    "Outdoor Adventure (Hiking + Nature + Park)",
    {
        "interests": ["hiking", "nature", "park"],
        "starting_address": "Denver, CO",
        "budget": "low",
        "travel_mode": "driving-car"
    }
)

# Test 3: Food and dining
test_case(
    "Food & Dining (Restaurant + Coffee + Bakery)",
    {
        "interests": ["restaurant", "coffee shop", "bakery"],
        "starting_address": "New York, NY",
        "budget": "high",
        "travel_mode": "public-transport"
    }
)

# Test 4: Shopping and leisure
test_case(
    "Shopping & Leisure (Shopping + Mall + Bookstore)",
    {
        "interests": ["shopping", "shopping mall", "bookstore"],
        "starting_address": "Los Angeles, CA",
        "budget": "high",
        "travel_mode": "driving-car"
    }
)

# Test 5: Entertainment focused
test_case(
    "Entertainment (Theater + Cinema + Music)",
    {
        "interests": ["theater", "cinema", "music venue"],
        "starting_address": "Chicago, IL",
        "budget": "medium",
        "travel_mode": "public-transport"
    }
)

# Test 6: Beach/relaxation
test_case(
    "Beach & Relaxation (Beach + Spa + Resort)",
    {
        "interests": ["beach", "spa", "resort"],
        "starting_address": "Miami, FL",
        "budget": "high",
        "travel_mode": "driving-car"
    }
)

# Test 7: Budget backpacker mix
test_case(
    "Budget Backpacker (Hostel + Museum + Cafe)",
    {
        "interests": ["hostel", "museum", "cafe"],
        "starting_address": "Portland, OR",
        "budget": "low",
        "travel_mode": "public-transport"
    }
)

# Test 8: Scheduled trip (MANUAL mode)
start_time = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
end_time = start_time + timedelta(hours=4)

test_case(
    "Scheduled Trip - MANUAL MODE (Museum + Coffee, 9AM-1PM)",
    {
        "interests": ["museum", "coffee"],
        "starting_address": "Boston, MA",
        "budget": "medium",
        "travel_mode": "driving-car",
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat()
    },
    mode="manual"
)

print(f"\n{'='*70}")
print("All tests completed!")
print(f"{'='*70}")
