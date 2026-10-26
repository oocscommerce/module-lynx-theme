<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\View\Page\Config as PageConfig;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;
use OOCS\LynxTheme\Observer\SetHtmlDirection;
use PHPUnit\Framework\TestCase;

/**
 * dir="rtl" on <html> for Arabic, Persian and Hebrew store views on a Lynx theme
 */
class SetHtmlDirectionTest extends TestCase
{
    /**
     * Whether the observer sets rtl for the locale and theme
     *
     * @param string $locale
     * @param bool $lynx
     * @return bool
     */
    private function setsRtl(string $locale, bool $lynx = true): bool
    {
        $set = false;
        $pageConfig = $this->createMock(PageConfig::class);
        $pageConfig->method('setElementAttribute')->willReturnCallback(function (...$args) use (&$set) {
            $set = $args === [PageConfig::ELEMENT_TYPE_HTML, 'dir', 'rtl'];
        });
        $resolver = $this->createMock(ResolverInterface::class);
        $resolver->method('getLocale')->willReturn($locale);
        $theme = $this->createMock(ThemeHelper::class);
        $theme->method('isLynxTheme')->willReturn($lynx);

        (new SetHtmlDirection($pageConfig, $resolver, $theme))->execute(new Observer());

        return $set;
    }

    /**
     * Right-to-left languages get rtl
     *
     * @return void
     */
    public function testRtlLanguages(): void
    {
        foreach (['ar_SA', 'fa_IR', 'he_IL'] as $locale) {
            $this->assertTrue($this->setsRtl($locale), $locale);
        }
    }

    /**
     * Left-to-right languages and other themes are left alone
     *
     * @return void
     */
    public function testOthers(): void
    {
        $this->assertFalse($this->setsRtl('en_US'));
        $this->assertFalse($this->setsRtl('fr_FR'));
        $this->assertFalse($this->setsRtl('ar_SA', false));
    }
}
