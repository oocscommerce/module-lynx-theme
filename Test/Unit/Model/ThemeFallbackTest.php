<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use OOCS\LynxTheme\Model\ThemeFallback;
use PHPUnit\Framework\TestCase;

/**
 * Theme Fallback settings: on or off, the theme, and the pages it applies to
 */
class ThemeFallbackTest extends TestCase
{
    /**
     * Fallback over these config values
     *
     * @param array $config
     * @return ThemeFallback
     */
    private function fallback(array $config): ThemeFallback
    {
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(fn ($path) => (bool) ($config[$path] ?? false));
        $scopeConfig->method('getValue')->willReturnCallback(fn ($path) => $config[$path] ?? null);

        return new ThemeFallback($scopeConfig);
    }

    /**
     * Exact names and trailing * prefixes match, ignoring case and blank lines
     *
     * @return void
     */
    public function testMatches(): void
    {
        $fallback = $this->fallback([
            'lynx_fallback/general/actions' => " multishipping_*\r\n\nVault_Cards_ListAction \n",
        ]);

        $this->assertTrue($fallback->matches('multishipping_checkout_addresses'));
        $this->assertTrue($fallback->matches('vault_cards_listaction'));
        $this->assertFalse($fallback->matches('vault_cards_list'));
        $this->assertFalse($fallback->matches('checkout_index_index'));
    }

    /**
     * No actions configured matches nothing
     *
     * @return void
     */
    public function testNoActions(): void
    {
        $this->assertFalse($this->fallback([])->matches('anything'));
    }

    /**
     * The switch and the theme come from config; the theme id is trimmed
     *
     * @return void
     */
    public function testSwitchAndTheme(): void
    {
        $fallback = $this->fallback([
            'lynx_fallback/general/enabled'        => '1',
            'lynx_fallback/general/fallback_theme' => ' 3 ',
        ]);

        $this->assertTrue($fallback->isEnabled());
        $this->assertTrue($fallback->isActive());
        $this->assertSame('3', $fallback->getThemeId());
        $this->assertFalse($this->fallback([])->isActive());
    }
}
